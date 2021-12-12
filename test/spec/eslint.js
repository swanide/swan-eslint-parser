/**
 * @file index spec
 * @author mengke(kekee000@gmail.com)
 */
/* eslint-disable import/unambiguous, @typescript-eslint/no-var-requires, import/no-commonjs */

const assert = require('assert');
const {parseForESLint} = require('../../');
const {Linter} = require('../eslint');

describe('parse', () => {
    it('parse swan', () => {
        const result = parseForESLint('<!--swan--><view s-if="{{cond}}"></view>', {
            filePath: 'page.swan',
            ecmaVersion: 2018,
            sourceType: 'module'
        });
        assert.ok(result.services.defineTemplateBodyVisitor, 'services.defineTemplateBodyVisitor');
        assert.ok(result.services.getDocumentFragment, 'services.getDocumentFragment');
        assert.ok(result.services.getTemplateBodyTokenStore, 'services.getTemplateBodyTokenStore');
        assert.ok(result.ast.body, 'ast.body');
        assert.ok(result.ast.comments, 'ast.comments');
        assert.ok(result.ast.templateBody, 'ast.templateBody');
        assert.ok(result.ast.templateBody.children, 'ast.children');
        assert.ok(result.ast.templateBody.comments, 'ast.comments');
        assert.ok(result.ast.templateBody.tokens, 'ast.tokens');

        assert.strictEqual(result.ast.templateBody.comments[0].value, 'swan');
        assert.strictEqual(result.ast.templateBody.children.length, 1);
        assert.strictEqual(result.ast.templateBody.tokens.length, 11);
    });
});


describe('lint', () => {
    const linter = new Linter();
    linter.defineParser('swan-xml-parser', {parseForESLint});
    linter.defineRule(
        'swan/no-duplicate-attributes',
        require('../example/rules/no-duplicate-attributes')
    );

    it('lint swan', () => {
        const code = '<view class="a" class="b">Hello</view>';
        const config = {
            parser: 'swan-xml-parser',
            parserOptions: {
                parser: false,
            },
            rules: {
                'swan/no-duplicate-attributes': 'error',
            },
        };
        const messages = linter.verify(code, config, 'test.swan');

        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0].ruleId, 'swan/no-duplicate-attributes');
    });
});
