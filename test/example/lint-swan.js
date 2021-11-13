/**
 * @file lint.ts
 * @author mengke(kekee000@gmail.com)
 */
/* eslint-disable import/unambiguous, @typescript-eslint/no-var-requires, import/no-commonjs */
const path = require('path');
const {Linter} = require('eslint');
const {readXmlFile, fixturesDir} = require('./util');

const PARSER_PATH = path.resolve(__dirname, '../../src/index.ts');

function lint() {
    const mpxmlFile = readXmlFile(`${fixturesDir}/expression.swan`);
    const code = mpxmlFile.content;
    const config = {
        parser: PARSER_PATH,
        rules: {
            'test-rule': 'error',
            'no-useless-mustache': 'error',
            'no-duplicate-attributes': 'error'
        },
    };
    const linter = new Linter();
    // eslint-disable-next-line import/no-dynamic-require
    linter.defineParser(PARSER_PATH, require(PARSER_PATH));

    linter.defineRule('test-rule', {
        create(context) {
            return context.parserServices.defineTemplateBodyVisitor({
                'XElement[name=\'view\']': function (node) {
                    // console.log(node)
                    context.report({node, message: 'OK'});
                },
            });
        }
    });

    linter.defineRule('no-useless-mustache', require('./rules/no-useless-mustache'));
    linter.defineRule('no-duplicate-attributes', require('./rules/no-duplicate-attributes'));

    const messages1 = linter.verify(code, config, mpxmlFile.filePath);
    console.log(messages1);
}

lint();

// const messages2 = linter.verify(linter.getSourceCode(), config, 'app.swan')
// console.log(messages2);
