/**
 * @file 语言相关定义
 * @author mengke01(kekee000@gmail.com)
 */

import { sortedIndexBy, sortedLastIndexBy } from 'lodash';
import { 
    ControlDirectivePrefix, EventDirectivePrefix, HasParent, SwanForExpression, 
    Token, XAttribute, XDirective, XDirectiveKey, XDocument, XElement, XExpression,
    XIdentifier, XModule, XMustache, XNode 
} from '../types/ast';
import { ScriptParserOptions } from '../types/parser';
import { Identifier, Reference, ArrayExpression} from '../types/script';
import {debug, ParseError} from './common';
import { LocationCalculator } from './location-calculator';
import { ExpressionParseResult, parseExpression, parseScriptElement } from './script/index';
import { analyzeExternalReferences } from './script/scope-analyzer';

export const SWAN_CAN_BE_LEFT_OPEN_TAGS = new Set(['_']);
export const SWAN_VOID_ELEMENT_TAGS = new Set(['include']);
export const SWAN_RAWTEXT_TAGS = new Set(['filter', 'import-sjs']);
export const SWAN_RCDATA_TAGS = new Set(['textarea']);
export const DIRECTIVE_NAME = /^(s-|bind:?|catch:?|capture-bind:|capture-catch:)([\w-]+)$/;


function getOwnerDocument(leafNode: XNode): XDocument | null {
    let node: XNode | null = leafNode;
    while (node != null && node.type !== 'XDocument') {
        node = node.parent;
    }
    return node as XDocument;
}

function createDirectiveKey(
    node: XIdentifier,
    parent: XDirective
): XDirectiveKey {
    // Parse node and tokens.
    const [, prefix, name] = node.name.match(DIRECTIVE_NAME)!;
    const directiveKey: XDirectiveKey = {
        type: 'XDirectiveKey',
        range: node.range,
        loc: node.loc,
        parent,
        name: name,
        prefix: prefix === 's-'
            ? prefix as ControlDirectivePrefix
            : prefix.replace(/:$/, '') as EventDirectivePrefix,
        rawPrefix: prefix,
        rawName: node.rawName
    };
    return directiveKey;
}

interface HasRange {
    range: [number, number];
}

/**
 * Get `x.range[0]`.
 * @param x The object to get.
 * @returns `x.range[0]`.
 */
function byRange0(x: HasRange): number {
    return x.range[0];
}

/**
 * Get `x.range[1]`.
 * @param x The object to get.
 * @returns `x.range[1]`.
 */
function byRange1(x: HasRange): number {
    return x.range[1];
}

/**
 * Get `x.pos`.
 * @param x The object to get.
 * @returns `x.pos`.
 */
function byIndex(x: ParseError): number {
    return x.offset;
}

/**
 * Replace the tokens in the given range.
 * @param document The document that the node is belonging to.
 * @param node The node to specify the range of replacement.
 * @param newTokens The new tokens.
 */
function replaceTokens(
    document: XDocument | null,
    node: HasRange,
    newTokens: Token[],
): void {
    if (document == null) {
        return;
    }

    const index = sortedIndexBy(document.tokens, node, byRange0);
    const count = sortedLastIndexBy(document.tokens, node, byRange1) - index;
    document.tokens.splice(index, count, ...newTokens);
}

/**
 * Insert the given comment tokens.
 * @param document The document that the node is belonging to.
 * @param newComments The comments to insert.
 */
function insertComments(
    document: XDocument | null,
    newComments: Token[],
): void {
    if (document == null || newComments.length === 0) {
        return;
    }

    const index = sortedIndexBy(document.comments, newComments[0], byRange0);
    document.comments.splice(index, 0, ...newComments);
}

/**
 * Insert the given error.
 * @param document The document that the node is belonging to.
 * @param error The error to insert.
 */
function insertError(
    document: XDocument | null,
    error: ParseError,
): void {
    if (document == null) {
        return;
    }

    const index = sortedIndexBy(document.errors, error, byIndex);
    document.errors.splice(index, 0, error);
}

/**
 * Resolve the variable of the given reference.
 * @param referene The reference to resolve.
 * @param element The belonging element of the reference.
 */
function resolveReference(referene: Reference, element: XNode): void {
    let node = element;

    // Find the variable of this reference.
    while (node != null && node.type === 'XElement') {
        for (const variable of node.variables) {
            if (variable.id.name === referene.id.name) {
                referene.variable = variable;
                variable.references.push(referene);
                return;
            }
        }
        node = node.parent;
    }
}

/**
 * Information of a mustache.
 */
export interface Mustache {
    value: string;
    startToken: Token;
    endToken: Token;
}

/**
 * Replace the given attribute by a directive.
 * @param code Whole source code text.
 * @param parserOptions The parser options to parse expressions.
 * @param locationCalculator The location calculator to adjust the locations of nodes.
 * @param node The attribute node to replace. This function modifies this node directly.
 */
export function convertToDirective(
    node: XAttribute,
): XDirective {
    debug(
        '[template] convert to directive: %s="%s" %j',
        node.key.name,
        node.value[0],
        node.range,
    );
    const directive: XDirective = node as any;
    directive.type = 'XDirective';
    directive.key = createDirectiveKey(
        node.key,
        directive
    );
    return directive;
}

/**
 * Parse the content of the given mustache.
 * @param parserOptions The parser options to parse expressions.
 * @param globalLocationCalculator The location calculator to adjust the locations of nodes.
 * @param node The expression container node. This function modifies the `expression` and `references` properties of this node.
 * @param mustache The information of mustache to parse.
 */
export function processMustache(
    parserOptions: ScriptParserOptions,
    globalLocationCalculator: LocationCalculator,
    node: XMustache,
    mustache: Mustache,
    isSpreadObject = false
): void {
    debug('[template] convert mustache {{%s}} %j', mustache.value, (mustache as any).range);
    let code = mustache.value;

    if (isSpreadObject) {
        code = `{${code}}`;
        mustache.startToken.range[1] -= 1;
        mustache.startToken.loc.end.column -= 1;
        mustache.startToken.value = '{';

        mustache.endToken.range[0] += 1;
        mustache.endToken.loc.start.column += 1;
        mustache.endToken.value = '}';
    }

    node.value = {
        type: 'XExpression',
        range: [mustache.startToken.range[1], mustache.endToken.range[0]],
        loc: {
            start: {
                line: mustache.startToken.loc.end.line,
                column: mustache.startToken.loc.end.column + 1
            },
            end: {
                line: mustache.endToken.loc.start.line,
                column: mustache.endToken.loc.start.column
            }
        },
        parent: node,
        expression: null,
        references: []
    };

    if (!code.trim()) {
        return;
    }
    
    // s-for 需要特殊处理
    if (node.parent.type === 'XDirective' && node.parent.key.name === 'for') {
        processForExpression(
            parserOptions, 
            globalLocationCalculator, 
            node.value,
            mustache.value
        );
    }
    else {
        processExpression(
            parserOptions, 
            globalLocationCalculator, 
            node.value,
            mustache.value
        );
    }
}

export function processExpression(
    parserOptions: ScriptParserOptions,
    globalLocationCalculator: LocationCalculator,
    node: XExpression,
    code: string
): void {
    debug('[template] convert expression {{%s}} %j', code, node.range);
    const range: [number, number] = [
        node.range[1],
        node.range[0],
    ];

    const document = getOwnerDocument(node);
    try {
        const locationCalculator = globalLocationCalculator.getSubCalculatorAfter(
            range[0],
        );
        const ret = parseExpression(
            code,
            locationCalculator,
            parserOptions,
            {allowEmpty: true},
        );

        node.expression = ret.expression || null;
        node.references = ret.references;
        if (ret.expression != null) {
            (ret.expression as HasParent).parent = node;
        }
        if (ret.tokens.length) {
            replaceTokens(document, {range}, ret.tokens);
        }
        resolveReferences(node);
    }
    catch (e) {
        debug('[template] Parse error: %s', e);

        if (ParseError.isParseError(e)) {
            insertError(document, e);
        }
        else {
            throw e;
        }
    }
}

type ForBlock = {
    code: string;
    range: [number, number];
};

export function processForExpression(
    parserOptions: ScriptParserOptions,
    globalLocationCalculator: LocationCalculator,
    node: XExpression,
    code: string
): void {
    debug('[template] convert expression {{%s}} %j', code, node.range);

    let forLeft = null as unknown as ForBlock;
    let forRight = null as unknown as ForBlock;
    let forTrackBy = null as unknown as ForBlock;
    const operator = code.match(/\sin\s|\strackBy\s/);
    if (operator) {
        // list trackBy item.id
        if (operator[0].includes('trackBy')) {
            forRight = {
                code: code.slice(0, operator.index),
                range: [node.range[0], node.range[0] + operator.index!]
            };
            forTrackBy = {
                code: code.slice(operator.index! + operator[0].length),
                range: [node.range[0] + operator.index! + operator[0].length, node.range[1]]
            };
        }
        // item in list
        // item,index in list
        else {
            forLeft = {
                code: code.slice(0, operator.index),
                range: [node.range[0], node.range[0] + operator.index!]
            };
            forRight = {
                code: code.slice(operator.index! + operator[0].length),
                range: [node.range[0] + operator.index! + operator[0].length, node.range[1]]
            };
        }
    }
    else {
        forRight = {
            code: code,
            range: [node.range[1], node.range[0]]
        };
    }

    const document = getOwnerDocument(node);
    try {
        const references = [];
        const tokens = [];
        const swanForExpression: SwanForExpression = {
            type: 'SwanForExpression',
            start: node.range[0],
            end: node.range[1],
            range: node.range,
            loc: node.loc,
            right: null,
            left: null,
            index: null,
            trackBy: null
        };

        if (forLeft) {
            const locationCalculator = globalLocationCalculator.getSubCalculatorAfter(
                forLeft.range[0],
            );
            const ret = parseExpression(
                `[${forLeft.code}]`,
                locationCalculator,
                parserOptions,
                {allowEmpty: false}
            ) as ExpressionParseResult<ArrayExpression>;
            references.push(...ret.references);
            if (ret.expression.elements.length) {
                swanForExpression.left = ret.expression.elements[0] as unknown as Identifier;
                (swanForExpression.left as any).parent = swanForExpression;
                if (ret.expression.elements[1]) {
                    swanForExpression.index = ret.expression.elements[1] as unknown as Identifier;
                    (swanForExpression.index as any).parent = swanForExpression;
                }
            }
            if (ret.tokens.length) {
                tokens.push(...ret.tokens);
            }
        }

        {
            const locationCalculator = globalLocationCalculator.getSubCalculatorAfter(
                forRight.range[0],
            );
            const ret = parseExpression(
                forRight.code,
                locationCalculator,
                parserOptions
            );
            references.push(...ret.references);
            swanForExpression.right = ret.expression as unknown as Identifier;
            if (swanForExpression.right != null) {
                (swanForExpression.right as any).parent = swanForExpression;
            }
            if (ret.tokens.length) {
                tokens.push(...ret.tokens);
            }
        }
        

        if (forTrackBy) {
           const locationCalculator = globalLocationCalculator.getSubCalculatorAfter(
                forTrackBy.range[0],
            );
            const ret = parseExpression(
                forTrackBy.code,
                locationCalculator,
                parserOptions
            );
            references.push(...ret.references);
            swanForExpression.trackBy = ret.expression as unknown as Identifier;
            if (swanForExpression.trackBy != null) {
                (swanForExpression.trackBy as any).parent = swanForExpression;
            }
            if (ret.tokens.length) {
                tokens.push(...ret.tokens);
            }
        }

        swanForExpression.parent = node;
        node.expression = swanForExpression;
        node.references = references;
        if (tokens.length) {
            replaceTokens(document, {range: node.range}, tokens);
        }
        resolveReferences(node);
    }
    catch (e) {
        debug('[template] Parse error: %s', e);

        if (ParseError.isParseError(e)) {
            insertError(document, e);
        }
        else {
            throw e;
        }
    }
}



/**
 * Parse the content of the given mustache.
 * @param parserOptions The parser options to parse expressions.
 * @param globalLocationCalculator The location calculator to adjust the locations of nodes.
 * @param node The expression container node. This function modifies the `expression` and `references` properties of this node.
 */
export function processScriptModule(
    parserOptions: any,
    globalLocationCalculator: LocationCalculator,
    node: XElement
) {
    // TODO:
    debug('[template] parse import-sjs module %s %j', node.name, node.range);
    const document = getOwnerDocument(node);
    try {
        const {ast} = parseScriptElement(node, globalLocationCalculator, parserOptions);
        const references = analyzeExternalReferences(ast, parserOptions);
        const moduleContainer: XModule = {
            type: 'XModule',
            parent: node,
            loc: ast.loc,
            range: ast.range,
            body: ast.body,
            references
        };
        node.children.splice(0, 1, moduleContainer);

        if (ast.tokens && ast.tokens.length > 0) {
            replaceTokens(document, {range: ast.range}, ast.tokens);
        }

        insertComments(document, ast.comments || []);
    }
    catch (e) {
        debug('[template] Parse error: %s', e);

        if (ParseError.isParseError(e)) {
            insertError(document, e);
        }
        else {
            throw e;
        }
    }
}

/**
 * Resolve all references of the given expression container.
 * @param expression The expression container to resolve references.
 */
export function resolveReferences(expression: XExpression): void {
    let element: XNode = expression.parent;

    // Get the belonging element.
    while (element != null && element.type !== 'XElement') {
        element = element.parent;
    }

    // Resolve.
    if (element != null) {
        for (const reference of expression.references) {
            resolveReference(reference, element);
        }
    }
}
