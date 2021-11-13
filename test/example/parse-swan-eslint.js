/**
 * @file parse swan
 * @author mengke(kekee000@gmail.com)
 */

const parser = require('../../src/index.ts');
const {readXmlFile, fixturesDir} = require('./util.js');


const mpxmlFile = readXmlFile(`${fixturesDir}/expression.swan`);
const code = mpxmlFile.content;

const result = parser.parseForESLint(
    code,
    {
        filePath: mpxmlFile.filePath
    }
);

console.log(result);
