/**
 * @file 语言相关定义
 * @author mengke01(kekee000@gmail.com)
 */

import {sortedIndexBy, sortedLastIndexBy} from 'lodash';
import {
    ControlDirectivePrefix, EventDirectivePrefix, HasParent, OffsetRange, SwanForExpression,
    Token, XAttribute, XDirective, XDirectiveKey, XDocument, XElement, XExpression,
    XIdentifier, XModule, XMustache, XNode
} from '../types/ast';
import {ScriptParserOptions} from '../types/parser';
import {Identifier, Reference, ArrayExpression} from '../types/script';
import {debug, ParseError} from './common';
import {LocationCalculator} from './location-calculator';
import { HasLocation } from './parser-services/ast';
import {ExpressionParseResult, parseExpression, parseScriptElement} from './script/index';
import {analyzeExternalReferences} from './script/scope-analyzer';

export const SWAN_CAN_BE_LEFT_OPEN_TAGS = new Set(['_']);
export const SWAN_VOID_ELEMENT_TAGS = new Set(['include']);
export const SWAN_RAWTEXT_TAGS = new Set(['filter', 'import-sjs']);
export const SWAN_RCDATA_TAGS = new Set(['textarea']);
export const DIRECTIVE_NAME = /^(s-|bind:?|catch:?|capture-bind:|capture-catch:)(\w[\w-.]+)$/;


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
    return x.index;
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
    if (!error.code) {
        error.code = 'x-expression-error';
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

const memberExpression = /^\s*(?:\w+\s*:|(["'])[\w.-]+\1\s*:)/;

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
    mustache: Mustache
): void {
    debug('[template] convert mustache {{%s}} %j', mustache.value, (mustache as any).range);
    let code = mustache.value;

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
        debug('[template] convert for directive {{%s}} %j', mustache.value, (mustache as any).range);
        processForExpression(
            parserOptions,
            globalLocationCalculator,
            node.value,
            code
        );
    }
    else {
        // 支持 {{abc: 1,def: 2}} 差值语法
        if (memberExpression.test(code) && mustache.startToken.value === '{{') {
            debug('[template] convert mustache member expression {{%s}} %j', mustache.value, (mustache as any).range);
            code = `{${code}}`;
            mustache.startToken.range[1] -= 1;
            mustache.startToken.loc.end.column -= 1;
            mustache.startToken.value = '{';

            mustache.endToken.range[0] += 1;
            mustache.endToken.loc.start.column += 1;
            mustache.endToken.value = '}';
        }

        processExpression(
            parserOptions,
            globalLocationCalculator,
            node.value,
            code
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
    // 处理仅有 1 个变量的插值语法 "abc", "{{abc}}"
    const identifierReg = /^(\s*)(\w+)\s*$/;
    let identifierMatch: RegExpMatchArray = null;
    if (identifierMatch = identifierReg.exec(code)) {
        const [,identifierLeft, identifierName] = identifierMatch;
        const range: OffsetRange = [
            node.range[0] + identifierLeft.length,
            node.range[0] + identifierLeft.length + identifierName.length
        ];
        const loc = {
            start: globalLocationCalculator.getLocation(range[0]),
            end: globalLocationCalculator.getLocation(range[1])
        };
        const identifier: Identifier = {
            type: 'Identifier',
            name: identifierName,
            range,
            loc
        };
        const token = {
            type: 'Identifier',
            range,
            loc,
            value: identifierName
        };
        node.expression = identifier;
        node.references = [{
            id: identifier,
            mode: 'r',
            variable: null,
        }];
        (node.expression as HasParent).parent = node;
        replaceTokens(getOwnerDocument(node), {range: node.range}, [token]);
        resolveReferences(node);
        return;
    }

    const range: OffsetRange = [...node.range];
    const document = getOwnerDocument(node);
    const locationCalculator = globalLocationCalculator.getSubCalculatorAfter(
        range[0],
    );
    try {
        const ret = parseExpression(
            code,
            locationCalculator,
            parserOptions
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
            // javascript reserved keyword 需要特殊处理
            if (/^The keyword '\w+' is reserved/.test(e.message)) {
                try {
                    const ret = parseExpression(
                        code,
                        locationCalculator,
                        {
                            ...parserOptions,
                            ecmaVersion: 3,
                            allowReserved: true,
                            sourceType: 'script'
                        }
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
                catch (kew) {
                    insertError(document, e);
                }
            }
            else {
                insertError(document, e);
            }
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

interface KeywordToken<T extends string> extends HasRange, HasLocation {
    type: 'Keyword';
    value: T;
};

export function processForExpression(
    rawParserOptions: ScriptParserOptions,
    globalLocationCalculator: LocationCalculator,
    node: XExpression,
    code: string
): void {
    debug('[template] convert expression {{%s}} %j', code, node.range);
    const parserOptions = {
        ...rawParserOptions,
        // TODO: s-for 指令不属于标准语法，不进行 token 替换
        // tokens: false
    };

    let forLeft = null as unknown as ForBlock;
    let forRight = null as unknown as ForBlock;
    let forTrackBy = null as unknown as ForBlock;
    const keyReg = /(?<ws>\s)(?<keyword>in|trackBy)\s/g;
    let match: RegExpMatchArray = null;
    let forLeftEndIndex = 0;
    let forTrackByStartOffset = code.length;
    let inToken: KeywordToken<'in'> = null;
    let trackByToken: KeywordToken<'trackBy'> = null;
    while (match = keyReg.exec(code)) {
        // item in list
        // item,index in list
        if (match.groups.keyword === 'in') {
            forLeft = {
                code: code.slice(0, match.index),
                range: [node.range[0], node.range[0] + match.index]
            };
            forLeftEndIndex = match.index + match[0].length;
            // remove white space
            const inOffset = node.range[0] + match.index + match.groups.ws.length;
            inToken = {
                type: 'Keyword',
                value: 'in',
                range: [inOffset, inOffset + 2],
                loc: {
                    start: globalLocationCalculator.getLocation(inOffset),
                    end: globalLocationCalculator.getLocation(inOffset + 2)
                }
            };
        }
        // list trackBy item.id
        else if (match.groups.keyword === 'trackBy') {
            forTrackBy = {
                code: code.slice(match.index + match[0].length),
                range: [node.range[0] + match.index + match[0].length, node.range[1]]
            };
            forTrackByStartOffset = match.index;

            const trackByOffset = node.range[0] + match.index + match.groups.ws.length;
            trackByToken = {
                type: 'Keyword',
                value: 'trackBy',
                range: [trackByOffset, trackByOffset + 7],
                loc: {
                    start: globalLocationCalculator.getLocation(trackByOffset),
                    end: globalLocationCalculator.getLocation(trackByOffset + 7)
                }
            };
        }
    }
    forRight = {
        code: code.slice(forLeftEndIndex, forTrackByStartOffset),
        range: [node.range[0] + forLeftEndIndex, node.range[0] + forTrackByStartOffset]
    };

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
                parserOptions
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
                ret.tokens.shift();
                ret.tokens.pop();
                tokens.push(...ret.tokens);
                tokens.push(inToken);
            }
        }
        // for right
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
                tokens.push(trackByToken);
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
 * Parse the content of the given script block.
 * @param parserOptions The parser options to parse expressions.
 * @param globalLocationCalculator The location calculator to adjust the locations of nodes.
 * @param node The expression container node. This function modifies the `expression` and `references` properties of this node.
 */
export function processScriptModule(
    rawParserOptions: ScriptParserOptions,
    globalLocationCalculator: LocationCalculator,
    node: XElement
) {
    debug('[template] parse import-sjs module %s %j', node.name, node.range);
    const parserOptions = {
        tokens: true,
        comment: true,
        ...rawParserOptions
    };
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
