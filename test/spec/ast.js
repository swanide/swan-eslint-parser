/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * @copyright 2017 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
/* eslint-disable import/no-dynamic-require, max-nested-callbacks */
//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const lodash = require('lodash');
const parser = require('../../');
const {Linter} = require('../eslint');

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const PARSER = path.resolve(__dirname, '../../');
const ROOT = path.join(__dirname, '../fixtures/ast');
const TARGETS = fs.readdirSync(ROOT);


/**
 * Remove `parent` proeprties from the given AST.
 * @param {string} key The key.
 * @param {any} value The value of the key.
 * @returns {any} The value of the key to output.
 */
function replacer(key, value) {
    if (key === 'parent') {
        return void 0;
    }
    if (key === 'errors' && Array.isArray(value)) {
        return value.map(e => ({
            message: e.message,
            index: e.index,
            lineNumber: e.lineNumber,
            column: e.column,
        }));
    }
    return value;
}

/**
 * Get all tokens of the given AST.
 * @param {ASTNode} ast The root node of AST.
 * @returns {Token[]} Tokens.
 */
function getAllTokens(ast) {
    const tokenArrays = [ast.tokens, ast.comments];
    if (ast.templateBody != null) {
        tokenArrays.push(ast.templateBody.tokens, ast.templateBody.comments);
    }
    return Array.prototype.concat.apply([], tokenArrays);
}

/**
 * Create simple tree.
 * @param {string} source The source code.
 * @returns {object} Simple tree.
 */
function getTree(source) {
    const linter = new Linter();
    const stack = [];
    const root = {children: []};
    let current = root;

    linter.defineParser(PARSER, require(PARSER));
    linter.defineRule('maketree', ruleContext =>
        ruleContext.parserServices.defineTemplateBodyVisitor({
            '*': function (node) {
                stack.push(current);
                current.children.push(
                    (current = {
                        type: node.type,
                        text: source.slice(node.range[0], node.range[1]),
                        children: [],
                    })
                );
            },
            '*:exit': function () {
                current = stack.pop();
            },
        }));
    linter.verify(
        source,
        {
            parser: PARSER,
            rules: {maketree: 'error'},
        },
        'source.swan'
    );

    return root.children;
}

/**
 * Convert a given node to string.
 * @param {Node} node The node to make string expression.
 * @param {string} source The source code.
 * @returns {string} The string expression of the node.
 */
function nodeToString(node, source) {
    return node ? `${node.type}[${source.slice(...node.range)}]` : 'void 0';
}

/**
 * Validate the parent property of every node.
 * @param {string} source The source code.
 * @returns {void}
 */
function validateParent(source) {
    const linter = new Linter();
    const stack = [];

    linter.defineParser(PARSER, require(PARSER));
    linter.defineRule('validateparent', ruleContext =>
        ruleContext.parserServices.defineTemplateBodyVisitor({
            '*': function (node) {
                if (stack.length >= 1) {
                    const parent = lodash.last(stack);
                    assert(
                        node.parent === parent,
                        `The parent of ${nodeToString(
                            node,
                            source
                        )} should be ${nodeToString(
                            parent,
                            source
                        )}, but got ${nodeToString(node.parent, source)}`
                    );
                }
                stack.push(node);
            },
            '*:exit': function () {
                stack.pop();
            },
        }));
    linter.verify(
        source,
        {
            parser: PARSER,
            rules: {validateparent: 'error'},
        },
        void 0,
        true
    );
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

describe('Template AST', () => {
    for (const name of TARGETS) {
        const sourcePath = path.join(ROOT, `${name}/source.swan`);
        const source = fs.readFileSync(sourcePath, 'utf8');
        const actual = parser.parseForESLint(
            source,
            {filePath: sourcePath}
        ); 

        describe(`'test/fixtures/ast/${name}/source.swan'`, () => {
            it('should be parsed to valid AST.', () => {
                const resultPath = path.join(ROOT, `${name}/ast.json`);
                const expected = fs.readFileSync(resultPath, 'utf8');

                assert.strictEqual(
                    JSON.stringify(actual.ast, replacer, 4),
                    expected
                );
            });

            it('should have correct range.', () => {
                const resultPath = path.join(ROOT, `${name}/token-ranges.json`);
                const expectedText = fs.readFileSync(resultPath, 'utf8');
                const tokens = getAllTokens(actual.ast)
                    .map(t => source.slice(t.range[0], t.range[1]));
                const actualText = JSON.stringify(tokens, null, 4);

                assert.strictEqual(actualText, expectedText);
            });

            it('should have correct range on windows(CRLF).', () => {
                const sourceForWin = source.replace(/\r?\n/gu, '\r\n');
                const actualForWin = parser.parseForESLint(
                    sourceForWin,
                    {filePath: sourcePath}
                );

                const resultPath = path.join(ROOT, `${name}/token-ranges.json`);
                const expectedText = fs.readFileSync(resultPath, 'utf8');
                const tokens = getAllTokens(actualForWin.ast).map(t =>
                    sourceForWin
                        .slice(t.range[0], t.range[1])
                        .replace(/\r?\n/gu, '\n'));
                const actualText = JSON.stringify(tokens, null, 4);

                assert.strictEqual(actualText, expectedText);
            });

            it('should have correct location.', () => {
                const lines = source.match(/[^\r\n]*(?:\r?\n|$)/gu) || [];
                lines.push(String.fromCodePoint(0));
                for (const token of getAllTokens(actual.ast)) {
                    const line0 = token.loc.start.line - 1;
                    const line1 = token.loc.end.line - 1;
                    const column0 = token.loc.start.column;
                    const column1 = token.loc.end.column;
                    const expected = source.slice(
                        token.range[0],
                        token.range[1]
                    );

                    let text = '';
                    if (line0 === line1) {
                        text = lines[line0].slice(column0, column1);
                    }
                    else {
                        text = lines[line0].slice(column0);
                        for (let i = line0 + 1; i < line1; ++i) {
                            text += lines[i];
                        }
                        text += lines[line1].slice(0, column1);
                    }

                    assert.strictEqual(
                        text,
                        expected,
                        `${JSON.stringify(
                            token,
                            null,
                            4
                        )} expected ${JSON.stringify(
                            expected
                        )}, but got ${JSON.stringify(text)}`
                    );
                }
            });

            // it('should traverse AST in the correct order.', () => {
            //     const resultPath = path.join(ROOT, `${name}/tree.json`);
            //     const expectedText = fs.readFileSync(resultPath, 'utf8');
            //     const tokens = getTree(source);
            //     const actualText = JSON.stringify(tokens, null, 4);

            //     assert.strictEqual(actualText, expectedText);
            // });

            it('should have correct parent properties.', () => {
                validateParent(source);
            });

            if (/\berror\b/.test(name)) {
                it('should have error.', () => {
                    actual.ast.templateBody && assert.ok(actual.ast.templateBody.errors.length > 0, sourcePath);
                });
            }
            else {
                it('should have no error.', () => {
                    actual.ast.templateBody && assert.ok(actual.ast.templateBody.errors.length === 0, sourcePath);
                });
            }
        });
        // break;
    }
});
