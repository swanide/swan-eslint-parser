const parser = require('../../');
const assert = require('assert');

describe('parse with expression', () => {
    it('parse mustache', () => {
        const ast = parser.parse('<view s-if="{{cond}}"></view>', {
            filePath: 'page.swan',
            parseExpression: true,
        });
        assert.ok(ast.comments, 'ast.comments');
        assert.ok(ast.tokens, 'ast.tokens');
        assert.ok(ast.children[0].startTag.attributes[0].value[0].type, 'XMustache');
        assert.ok(ast.children[0].startTag.attributes[0].value[0].value.type, 'XExpression');
        assert.ok(ast.children[0].startTag.attributes[0].value[0].value.expression.type, 'Identifier');
    });

    it('parse directive expression', () => {
        const ast = parser.parse('<view s-if="cond"></view>', {
            filePath: 'page.swan',
            parseExpression: true,
        });
        assert.ok(ast.comments, 'ast.comments');
        assert.ok(ast.tokens, 'ast.tokens');
        assert.ok(ast.children[0].startTag.attributes[0].value[0].type, 'XExpression');
        assert.ok(ast.children[0].startTag.attributes[0].value[0].expression.type, 'Identifier');
    });

    it('parse module', () => {
        const ast = parser.parse('<import-sjs module="module">exports.a = 1;</import-sjs>', {
            filePath: 'page.swan',
            parseExpression: true,
        });
        assert.ok(ast.comments, 'ast.comments');
        assert.ok(ast.tokens, 'ast.tokens');
        assert.ok(ast.children[0].children[0].type, 'XModule');
        assert.ok(ast.children[0].children[0].body.length, 1);
    });
});


describe('parse with no expression', () => {
    it('parse mustache', () => {
        const ast = parser.parse('<view s-if="{{cond}}"></view>', {
            filePath: 'page.swan',
            parseExpression: false,
        });
        assert.ok(ast.comments, 'ast.comments');
        assert.ok(ast.tokens, 'ast.tokens');
        assert.ok(ast.children[0].startTag.attributes[0].value[0].type, 'Mustache');
        assert.ok(ast.children[0].startTag.attributes[0].value[0].value, 'cond');
    });

    it('parse directive expression', () => {
        const ast = parser.parse('<view s-if="cond"></view>', {
            filePath: 'page.swan',
            parseExpression: false,
        });
        assert.ok(ast.comments, 'ast.comments');
        assert.ok(ast.tokens, 'ast.tokens');
        assert.ok(ast.children[0].startTag.attributes[0].value[0].type, 'XLiteral');
        assert.ok(ast.children[0].startTag.attributes[0].value[0].value, 'cond');
    });

    it('parse module', () => {
        const ast = parser.parse('<import-sjs module="module">exports.a = 1;</import-sjs>', {
            filePath: 'page.swan',
            parseExpression: false,
        });
        assert.ok(ast.comments, 'ast.comments');
        assert.ok(ast.tokens, 'ast.tokens');
        assert.ok(ast.children[0].children[0].type, 'XText');
        assert.ok(ast.children[0].children[0].value, 'exports.a = 1;');
    });
});
