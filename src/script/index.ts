/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * @copyright 2017 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
/* eslint-disable @typescript-eslint/no-use-before-define */
import sortedIndexBy from 'lodash/sortedIndexBy';
import {HasLocation, Token, XElement, OffsetRange, Node, HasParent} from '../../types/ast';
import {ScriptParserOptions } from '../../types/parser';
import {
    Reference,
    Variable,
    ExpressionStatement,
    CallExpression,
    Expression,
    ExtendedProgram,
    SpreadElement
} from '../../types/script';
import {debug, ParseError} from '../common';
import {LocationCalculator} from '../location-calculator';
import {
    analyzeExternalReferences,
} from './scope-analyzer';
import { traverseNodes } from './traverse';

/**
 * Do post-process of parsing an expression.
 *
 * 1. Set `node.parent`.
 * 2. Fix `node.range` and `node.loc` for HTML entities.
 *
 * @param result The parsing result to modify.
 * @param locationCalculator The location calculator to modify.
 */
function postprocess(
    result: ExtendedProgram,
    locationCalculator: LocationCalculator,
): void {
    // There are cases which the same node instance appears twice in the tree.
    // E.g. `let {a} = {}` // This `a` appears twice at `Property#key` and `Property#value`.
    const traversed = new Set<Node | number[]>();

    traverseNodes(result.ast, {
        visitorKeys: result.visitorKeys,

        enterNode(node, parent) {
            if (!traversed.has(node)) {
                traversed.add(node);
                (node as HasParent).parent = parent;

                // `babel-eslint@8` has shared `Node#range` with multiple nodes.
                // See also: https://github.com/vuejs/eslint-plugin-vue/issues/208
                if (!traversed.has(node.range as OffsetRange)) {
                    traversed.add(node.range as OffsetRange);
                    locationCalculator.fixLocation(node as HasLocation);
                }
            }
        },

        leaveNode() {
            // Do nothing.
        },
    });

    for (const token of result.ast.tokens || []) {
        locationCalculator.fixLocation(token);
    }
    for (const comment of result.ast.comments || []) {
        locationCalculator.fixLocation(comment);
    }
}


/**
 * Get the comma token before a given node.
 * @param tokens The token list.
 * @param node The node to get the comma before this node.
 * @returns The comma token.
 */
function getCommaTokenBeforeNode(tokens: Token[], node: Node): Token | null {
    let tokenIndex = sortedIndexBy<{range: OffsetRange}>(
        tokens,
        {
            range: node.range!
        },
        t => t.range[0],
    );

    while (tokenIndex >= 0) {
        const token = tokens[tokenIndex];
        if (token.type === 'Punctuator' && token.value === ',') {
            return token;
        }
        tokenIndex -= 1;
    }

    return null;
}

/**
 * Throw syntax error for empty.
 * @param locationCalculator The location calculator to get line/column.
 */
function throwEmptyError(
    locationCalculator: LocationCalculator,
    expected: string,
): never {
    const loc = locationCalculator.getLocation(0);
    const e = new ParseError(
        `Expected to be ${expected}, but got empty.`,
        void 0,
        0,
        loc.line,
        loc.column,
    );
    locationCalculator.fixErrorLocation(e);

    throw e;
}

/**
 * Throw syntax error for unexpected token.
 * @param locationCalculator The location calculator to get line/column.
 * @param name The token name.
 * @param token The token object to get that location.
 */
function throwUnexpectedTokenError(name: string, token: HasLocation): never {
    const e = new ParseError(
        `Unexpected token '${name}'.`,
        void 0,
        token.range[0],
        token.loc.start.line,
        token.loc.start.column,
    );

    throw e;
}

/**
 * Throw syntax error of outside of code.
 * @param locationCalculator The location calculator to get line/column.
 */
function throwErrorAsAdjustingOutsideOfCode(
    e: any,
    code: string,
    locationCalculator: LocationCalculator,
): never {
    if (ParseError.isParseError(e)) {
        const endOffset = locationCalculator.getOffsetWithGap(code.length);
        if (e.offset >= endOffset) {
            e.message = 'Unexpected end of expression.';
        }
    }

    throw e;
}

/**
 * Parse the given source code.
 *
 * @param code The source code to parse.
 * @param locationCalculator The location calculator for postprocess.
 * @param parserOptions The parser options.
 * @returns The result of parsing.
 */
function parseScriptFragment(
    code: string,
    locationCalculator: LocationCalculator,
    parserOptions: ScriptParserOptions,
): ExtendedProgram {
    try {
        const result = parseScript(code, parserOptions);
        postprocess(result, locationCalculator);
        return result;
    }
    catch (e) {
        const perr = ParseError.normalize(e);
        if (perr) {
            locationCalculator.fixErrorLocation(perr);
            throw perr;
        }
        throw e;
    }
}


/**
 * Parse the source code of inline scripts.
 * @param code The source code of inline scripts.
 * @param locationCalculator The location calculator for the inline script.
 * @param parserOptions The parser options.
 * @returns The result of parsing.
 */
function parseExpressionBody(
    code: string,
    locationCalculator: LocationCalculator,
    parserOptions: ScriptParserOptions,
    allowEmpty = false,
): ExpressionParseResult<Expression> {
    debug('[script] parse expression: "0(%s)"', code);

    try {
        const {ast} = parseScriptFragment(
            `0(${code})`,
            locationCalculator.getSubCalculatorShift(-2),
            parserOptions,
        );
        const tokens = ast.tokens || [];
        const comments = ast.comments || [];
        const references = analyzeExternalReferences(ast, parserOptions);
        const statement = ast.body[0] as ExpressionStatement;
        const callExpression = statement.expression as CallExpression;
        const expression = callExpression.arguments[0] as Expression;

        if (!allowEmpty && !expression) {
            return throwEmptyError(locationCalculator, 'an expression');
        }
        if ((expression as unknown as SpreadElement).type === 'SpreadElement') {
            return throwUnexpectedTokenError('...', expression as HasLocation);
        }
        if (callExpression.arguments[1]) {
            const node = callExpression.arguments[1];
            return throwUnexpectedTokenError(
                ',',
                (getCommaTokenBeforeNode(tokens, node) || node) as HasLocation,
            );
        }

        // Remove parens.
        tokens.shift();
        tokens.shift();
        tokens.pop();

        return {expression, tokens, comments, references, variables: []};
    }
    catch (e) {
        return throwErrorAsAdjustingOutsideOfCode(e, code, locationCalculator);
    }
}

/**
 * The result of parsing expressions.
 */
export interface ExpressionParseResult<T extends Node> {
    expression: T | null;
    tokens: Token[];
    comments: Token[];
    references: Reference[];
    variables: Variable[];
}

/**
 * Parse the given source code.
 *
 * @param code The source code to parse.
 * @param parserOptions The parser options.
 * @returns The result of parsing.
 */
export function parseScript(
    code: string,
    parserOptions: ScriptParserOptions,
): ExtendedProgram {
    const parser = parserOptions.parser 
        ? require(parserOptions.parser) 
        : require('espree');
    const result: any = typeof parser.parseForESLint === 'function'
        ? parser.parseForESLint(code, parserOptions)
        : parser.parse(code, parserOptions);

    if (result.ast != null) {
        return result;
    }
    return {ast: result};
}


/**
 * Parse the source code of the given `<import-sjs>` element.
 * @param node The `<import-sjs>` element to parse.
 * @param globalLocationCalculator The location calculator for postprocess.
 * @param parserOptions The parser options.
 * @returns The result of parsing.
 */
export function parseScriptElement(
    node: XElement,
    globalLocationCalculator: LocationCalculator,
    parserOptions: ScriptParserOptions,
): ExtendedProgram {
    const textNode = node.children[0];
    const offset = textNode != null && textNode.type === 'XText'
        ? textNode.range[0]
        : node.startTag.range[1];
    const code = textNode != null && textNode.type === 'XText' ? textNode.value : '';
    const locationCalculator = globalLocationCalculator.getSubCalculatorAfter(
        offset
    );
    const result = parseScriptFragment(
        code,
        locationCalculator,
        parserOptions
    );

    result.ast.loc = textNode.loc;
    result.ast.range = textNode.range;
    return result;
}

/**
 * Parse the source code of inline scripts.
 * @param code The source code of inline scripts.
 * @param locationCalculator The location calculator for the inline script.
 * @param parserOptions The parser options.
 * @returns The result of parsing.
 */
export function parseExpression(
    code: string,
    locationCalculator: LocationCalculator,
    parserOptions: ScriptParserOptions,
    {allowEmpty = false} = {},
): ExpressionParseResult<Expression> {
    debug('[script] parse expression: "%s"', code);

    return parseExpressionBody(
        code,
        locationCalculator,
        parserOptions,
        allowEmpty,
    );
}
