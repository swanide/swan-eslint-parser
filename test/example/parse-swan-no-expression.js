/**
 * @file parse swan
 * @author mengke(kekee000@gmail.com)
 */

const parser = require('../../src/index.ts');
const {readXmlFile} = require('./util.js');

function travels(node) {
    delete node.parent;
    if (node.children) {
        node.children.forEach(travels);
    }
    if (node.attributes) {
        node.attributes.forEach(travels);
    }
    for (let key of Object.keys(node)) {
        if (node[key] && typeof node[key] === 'object') {
            delete node[key].parent;
        }
    }
}

const mpxmlFile = readXmlFile(`${__dirname}/expression.swan`);
const code = mpxmlFile.content;

console.time('parse');
const ast = parser.parse(
    code,
    {
        filePath: mpxmlFile.filePath,
        noOpenTag: true,
        parseExpression: false
    }
);
console.timeEnd('parse');
if (ast.errors.length) {
    console.log(JSON.stringify(ast.errors, null, 2));
}

// travels(ast);
// delete ast.tokens;
// console.log(JSON.stringify(ast, function (key, value) {
//     if (key === 'parent') {
//         return void 0;
//     }
//     return value;
// }, 2));