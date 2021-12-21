/**
 * @file parse swan
 * @author mengke(kekee000@gmail.com)
 */

const path = require('path');
const parser = require('../../src/index.ts');
const {readXmlFile} = require('./util.js');


function main(projectDir) {
    const swanFiles = require('glob').sync('**/*.swan', {
        cwd: projectDir,
        ignore: [
            // 'node_modules/**/*.swan'
        ]
    });
    let errorsCount = 0;
    for (const swanFile of swanFiles) {
        const {content, filePath} = readXmlFile(path.resolve(projectDir, swanFile));
        console.time(`parse:${swanFile}`);
        const ast = parser.parse(
            content,
            {
                filePath
            }
        );
        console.timeEnd(`parse:${swanFile}`);
        if (ast.errors.length) {
            errorsCount += ast.errors.length;
            console.log(`${filePath} has errors:`);
            console.log(JSON.stringify(ast.errors, null, 2));
        }
    }
    console.log('errors', errorsCount);
}

main(process.argv[2] || __dirname);
