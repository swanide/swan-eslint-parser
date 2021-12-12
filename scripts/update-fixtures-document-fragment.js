'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const parser = require('../');

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const ROOT = path.join(__dirname, '../test/fixtures/document-fragment');
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

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

for (const name of TARGETS) {
    const sourceFileName = fs
        .readdirSync(path.join(ROOT, name))
        .find(f => f.startsWith('source.'));
    const sourcePath = path.join(ROOT, `${name}/${sourceFileName}`);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const result = parser.parseForESLint(
        source,
        {filePath: sourcePath}
    );
    const actual = result.services.getDocumentFragment();

    const resultPath = path.join(ROOT, `${name}/document-fragment.json`);

    console.log('Update:', name);

    fs.writeFileSync(resultPath, JSON.stringify(actual, replacer, 4));
}
