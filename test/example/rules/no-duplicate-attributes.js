/**
 * @author Yosuke Ota
 * See LICENSE file in root directory for full license.
 */
/* eslint-disable import/unambiguous, @typescript-eslint/no-var-requires, import/no-commonjs, @typescript-eslint/prefer-optional-chain */
'use strict';

function getName(attribute) {
    if (attribute.key.prefix === 'bind') {
        return `${attribute.key.prefix}:${attribute.key.name}`;
    }
    return attribute.key.rawName || attribute.key.name;
}


module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'disallow duplication of attributes',
            categories: ['essential'],
            url: ''
        },
        fixable: null,

        schema: []
    },

    /** @param {RuleContext} context */
    create(context) {

        const directiveNames = new Set();
        const attributeNames = new Set();

        function isDuplicate(name) {
            return directiveNames.has(name) || attributeNames.has(name);
        }

        return context.parserServices.defineTemplateBodyVisitor({
            XStartTag() {
                directiveNames.clear();
                attributeNames.clear();
            },
            ['XAttribute, XDirective'](node) {
                const name = getName(node);
                if (name == null) {
                    return;
                }
                if (isDuplicate(name, node.directive)) {
                    context.report({
                        node,
                        loc: node.loc,
                        message: 'Duplicate attribute \'{{name}}\'.',
                        data: {name}
                    });
                }

                if (node.directive) {
                    directiveNames.add(name);
                }
                else {
                    attributeNames.add(name);
                }
            }
        });
    }
};
