/**
 * @author Yosuke Ota
 * See LICENSE file in root directory for full license.
 */
/* eslint-disable import/unambiguous, @typescript-eslint/no-var-requires, import/no-commonjs, @typescript-eslint/prefer-optional-chain */

'use strict';

/**
 * Strip quotes string
 * @param {string} text
 * @returns {string|null}
 */
function stripQuotesForHTML(text) {
    if ((text[0] === '"' || text[0] === '\'' || text[0] === '`') && text[0] === text[text.length - 1]) {
        return text.slice(1, -1);
    }

    const re = /^(?:&(?:quot|apos|#\d+|#x[\da-f]+);|["'`])([\s\S]*)(?:&(?:quot|apos|#\d+|#x[\da-f]+);|["'`])$/u.exec(
        text
    );
    if (!re) {
        return null;
    }
    return re[1];
}

module.exports = {
    meta: {
        docs: {
            description: 'disallow unnecessary mustache interpolations',
            categories: void 0,
            url: 'https://no-useless-mustaches.html'
        },
        fixable: 'code',
        messages: {
            unexpected: 'Unexpected mustache interpolation with a string literal value.',
            empty: 'Unexpected mustache interpolation empty.'
        },
        schema: [
            {
                type: 'object',
                properties: {
                    ignoreIncludesComment: {
                        type: 'boolean'
                    },
                    ignoreStringEscape: {
                        type: 'boolean'
                    }
                }
            }
        ],
        type: 'suggestion'
    },

    /** @param {RuleContext} context */
    create(context) {
        const opts = context.options[0] || {};
        const {ignoreIncludesComment} = opts;
        const {ignoreStringEscape} = opts;

        /**
         * Report if the value expression is string literals
         * @param {VExpressionContainer} node the node to check
         */
        function verify(node) {
            const {expression} = node;
            if (!expression) {
                context.report({
                    node,
                    messageId: 'empty'
                });
                return;
            }

            /** @type {string} */
            let strValue;

            /** @type {string} */
            let rawValue;
            if (expression.type === 'Literal') {
                if (typeof expression.value !== 'string') {
                    return;
                }
                strValue = expression.value;
                rawValue = expression.raw;
            }
            else if (expression.type === 'TemplateLiteral') {
                if (expression.expressions.length > 0) {
                    return;
                }
                strValue = expression.quasis[0].value.cooked;
                rawValue = expression.quasis[0].value.raw;
            }
            else {
                return;
            }

            const tokenStore = context.parserServices.getTemplateBodyTokenStore();
            const hasComment = tokenStore
                .getTokens(node, {includeComments: true})
                .some(t => t.type === 'Block' || t.type === 'Line');
            if (ignoreIncludesComment && hasComment) {
                return;
            }

            let hasEscape = false;
            if (rawValue !== strValue) {
                // check escapes
                const chars = [...rawValue];
                let c = chars.shift();
                while (c) {
                    if (c === '\\') {
                        c = chars.shift();
                        // ignore "\\", '"', "'", "`" and "$"
                        if (c == null || 'nrvtbfux'.includes(c)) {
                            // has useful escape.
                            hasEscape = true;
                            break;
                        }
                    }
                    c = chars.shift();
                }
            }
            if (ignoreStringEscape && hasEscape) {
                return;
            }

            context.report({
                node,
                messageId: 'unexpected',
                fix(fixer) {
                    if (hasComment || hasEscape) {
                        // cannot fix
                        return null;
                    }
                    const text = stripQuotesForHTML(expression.raw);
                    if (text == null) {
                        // unknowns
                        return null;
                    }
                    if (text.includes('\n') || /^\s|\s$/u.test(text)) {
                        // It doesn't autofix because another rule like indent or eol space might remove spaces.
                        return null;
                    }

                    return fixer.replaceText(node, text.replace(/\\([\s\S])/g, '$1'));
                }
            });
        }

        return context.parserServices.defineTemplateBodyVisitor({
            'XMustache > XExpression': verify
        });
    }
};
