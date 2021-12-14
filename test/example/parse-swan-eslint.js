/**
 * @file parse swan
 * @author mengke(kekee000@gmail.com)
 */

const parser = require('../../src/index.ts');
const {readXmlFile} = require('./util.js');


const mpxmlFile = readXmlFile(`${__dirname}/expression.swan`);
const code = mpxmlFile.content;

const result = parser.parseForESLint(
    code,
    {
        filePath: mpxmlFile.filePath
    }
);

console.log(result);
