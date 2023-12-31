/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * @copyright 2017 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const parser = require('../');

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const ROOT = path.join(__dirname, '../test/fixtures/ast');
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
 * @param {ASTNode} ast The root node.
 * @returns {object} Simple tree.
 */
function getTree(source, ast) {
    if (ast.templateBody == null) {
        return [];
    }

    const stack = [];
    const root = {children: []};
    let current = root;

    parser.traverseNodes(ast.templateBody, {
        enterNode(node) {
            stack.push(current);
            current.children.push(
                (current = {
                    type: node.type,
                    text: source.slice(node.range[0], node.range[1]),
                    children: [],
                })
            );
        },
        leaveNode() {
            current = stack.pop();
        },
    });

    return root.children;
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

for (const name of TARGETS) {
    const sourcePath = path.join(ROOT, `${name}/source.swan`);
    const astPath = path.join(ROOT, `${name}/ast.json`);
    const tokenRangesPath = path.join(ROOT, `${name}/token-ranges.json`);
    const treePath = path.join(ROOT, `${name}/tree.json`);
    const source = fs.readFileSync(sourcePath, 'utf8');
    console.log('Updating:', name);
    const actual = parser.parseForESLint(
        source,
        {filePath: sourcePath}
    );
    const tokenRanges = getAllTokens(actual.ast).map(t => 
        source.slice(t.range[0], t.range[1]));
    const tree = getTree(source, actual.ast);

    console.log('done');

    fs.writeFileSync(astPath, JSON.stringify(actual.ast, replacer, 4));
    fs.writeFileSync(tokenRangesPath, JSON.stringify(tokenRanges, replacer, 4));
    fs.writeFileSync(treePath, JSON.stringify(tree, replacer, 4));
}
