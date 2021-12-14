/**
 * @file no-parsing-error.js
 * @author mengke(kekee000@gmail.com)
 */


const DEFAULT_OPTIONS = Object.freeze(
    Object.assign(Object.create(null), {
        'abrupt-closing-of-empty-comment': true,
        'absence-of-digits-in-numeric-character-reference': true,
        'cdata-in-html-content': true,
        'character-reference-outside-unicode-range': true,
        'control-character-in-input-stream': true,
        'control-character-reference': true,
        'eof-before-tag-name': true,
        'eof-in-cdata': true,
        'eof-in-comment': true,
        'eof-in-tag': true,
        'incorrectly-closed-comment': true,
        'incorrectly-opened-comment': true,
        'invalid-first-character-of-tag-name': true,
        'missing-attribute-value': true,
        'missing-end-tag-name': true,
        'missing-semicolon-after-character-reference': true,
        'missing-whitespace-between-attributes': true,
        'nested-comment': true,
        'noncharacter-character-reference': true,
        'noncharacter-in-input-stream': true,
        'null-character-reference': true,
        'surrogate-character-reference': true,
        'surrogate-in-input-stream': true,
        'unexpected-character-in-attribute-name': true,
        'unexpected-character-in-unquoted-attribute-value': true,
        'unexpected-equals-sign-before-attribute-name': true,
        'unexpected-null-character': true,
        'unexpected-question-mark-instead-of-tag-name': true,
        'unexpected-solidus-in-tag': true,
        'unknown-named-character-reference': true,
        'end-tag-with-attributes': true,
        'duplicate-attribute': true,
        'end-tag-with-trailing-solidus': true,
        'non-void-html-element-start-tag-with-trailing-solidus': false,
        'x-invalid-end-tag': true,
        'x-invalid-namespace': true,
        'attribute-value-invalid-unquoted': true,
        'unexpected-line-break': true,
        'missing-expression-end-tag': true,
    })
);

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'disallow parsing errors',
            categories: ['base'],
            url: 'https://no-parsing-error'
        },
        fixable: null,
        schema: [
            {
                type: 'object',
                properties: Object.keys(DEFAULT_OPTIONS).reduce((ret, code) => {
                    ret[code] = {type: 'boolean'};
                    return ret;
                }, /** @type { { [key: string]: { type: 'boolean' } } } */ ({})),
                additionalProperties: false
            }
        ]
    },

    /**
     * @param {RuleContext} context - The rule context.
     */
    create(context) {
        const options = {...DEFAULT_OPTIONS, ...context.options[0] || {}};

        return {

            /** @param {XProgram} program */
            Program(program) {
                const node = program.templateBody;
                if (node == null || node.errors == null) {
                    return;
                }

                for (const error of node.errors) {
                    if (error.code && !options[error.code]) {
                        continue;
                    }

                    context.report({
                        node,
                        loc: {line: error.lineNumber, column: error.column},
                        message: 'Parsing error: {{message}}.',
                        data: {
                            message: error.message.endsWith('.')
                                ? error.message.slice(0, -1)
                                : error.message
                        }
                    });
                }
            }
        };
    }
};
