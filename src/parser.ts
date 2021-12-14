/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * @copyright 2017 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
import assert from 'assert';
import last from 'lodash/last';
import findLastIndex from 'lodash/findLastIndex';
import {
    ErrorCode,
    HasLocation,
    Token,
    XAttribute,
    XDocument,
    XElement,
    XExpression,
    XMustache,
    XNode,
} from '../types/ast';
import {ParserOptions} from '../types/parser';

import {debug, ParseError} from './common';
import {LocationCalculator} from './location-calculator';
import {
    SWAN_CAN_BE_LEFT_OPEN_TAGS,
    SWAN_VOID_ELEMENT_TAGS,
    SWAN_RAWTEXT_TAGS,
    SWAN_RCDATA_TAGS,
    DIRECTIVE_NAME,
    convertToDirective,
    processMustache,
    processScriptModule,
    processExpression,
    processForExpression
} from './swan-lang';
import IntermediateTokenizer, {
    IntermediateToken,
    EndTag,
    StartTag,
    Text,
    Mustache,
} from './intermediate-tokenizer';
import Tokenizer from './tokenizer';

const DUMMY_PARENT: any = Object.freeze({});


/**
 * Set the location of the last child node to the end location of the given node.
 * @param node The node to commit the end location.
 */
function propagateEndLocation(node: XDocument | XElement): void {
    const lastChild
        = (node.type === 'XElement' ? node.endTag : null) || last(node.children as XNode[]);
    if (lastChild != null) {
        node.range[1] = lastChild.range[1];
        node.loc.end = lastChild.loc.end;
    }
}

/**
 * The parser of HTML.
 * This is not following to the HTML spec completely because wxml template spec is pretty different to HTML.
 */
export default class Parser {
    private tokenizer: IntermediateTokenizer;

    private locationCalculator: LocationCalculator;

    private parserOptions: ParserOptions;

    private document: XDocument;

    private elementStack: XElement[];

    /**
     * The tokens.
     */
    private get tokens(): Token[] {
        return this.tokenizer.tokens;
    }

    /**
     * The comments.
     */
    private get comments(): Token[] {
        return this.tokenizer.comments;
    }

    /**
     * The syntax errors which are found in this parsing.
     */
    private get errors(): ParseError[] {
        return this.tokenizer.errors;
    }

    /**
     * The current flag of expression enabled.
     */
    // @ts-ignore
    private get expressionEnabled(): boolean {
        return this.tokenizer.expressionEnabled;
    }

    private set expressionEnabled(value: boolean) {
        this.tokenizer.expressionEnabled = value;
    }

    /**
     * Get the current node.
     */
    private get currentNode(): XDocument | XElement {
        return last(this.elementStack) || this.document;
    }

    /**
     * Initialize this parser.
     * @param tokenizer The tokenizer to parse.
     * @param parserOptions The parser options to parse inline expressions.
     */
    public constructor(tokenizer: Tokenizer, parserOptions: ParserOptions) {
        this.tokenizer = new IntermediateTokenizer(tokenizer);
        this.locationCalculator = new LocationCalculator(
            tokenizer.gaps,
            tokenizer.lineTerminators,
        );
        this.parserOptions = parserOptions;
        this.document = {
            type: 'XDocument',
            range: [0, 0],
            loc: {
                start: {line: 1, column: 0},
                end: {line: 1, column: 0},
            },
            parent: null,
            children: [],
            tokens: this.tokens,
            comments: this.comments,
            errors: this.errors,
            xmlType: 'swan'
        };
        this.elementStack = [];
        this.expressionEnabled = true;
    }

    /**
     * Parse the HTML which was given in this constructor.
     * @returns The result of parsing.
     */
    public parse(): XDocument {
        let token: IntermediateToken | null = null;
        while ((token = this.tokenizer.nextToken()) != null) {
            (this as any)[token.type](token);
        }

        this.popElementStackUntil(0);
        propagateEndLocation(this.document);

        return this.document;
    }

    /**
     * Report an invalid character error.
     * @param code The error code.
     */
    private reportParseError(token: HasLocation, code: ErrorCode): void {
        const error = ParseError.fromCode(
            code,
            token.range[0],
            token.loc.start.line,
            token.loc.start.column,
        );
        this.errors.push(error);

        debug('[swan] syntax error:', error.message);
    }

    /**
     * Pop an element from the current element stack.
     */
    private popElementStack(): void {
        assert(this.elementStack.length >= 1);

        const element = this.elementStack.pop()!;
        propagateEndLocation(element);
        // TODO 检查 end tag
        if (!element.endTag && this.parserOptions.noOpenTag) {
            this.reportParseError(element.startTag, 'missing-end-tag');
        }
        // Update expression flag.
        if (this.elementStack.length === 0) {
            this.expressionEnabled = false;
        }
    }

    /**
     * Pop elements from the current element stack.
     * @param index The index of the element you want to pop.
     */
    private popElementStackUntil(index: number): void {
        while (this.elementStack.length > index) {
            this.popElementStack();
        }
    }

    /**
     * Close the current element if necessary.
     * @param name The tag name to check.
     */
    private closeCurrentElementIfNecessary(name: string): void {
        const element = this.currentNode;
        if (element.type !== 'XElement') {
            return;
        }

        if (element.name === name && SWAN_CAN_BE_LEFT_OPEN_TAGS.has(name)) {
            this.popElementStack();
        }
    }

    /**
     * Adjust and validate the given attribute node.
     * @param node The attribute node to handle.
     */
    private processAttribute(node: XAttribute): void {
        const attrName = node.key.name;
        if (DIRECTIVE_NAME.test(attrName)) {
            const directiveNode = convertToDirective(node);
            if (node.value.length === 1 && node.value[0].type === 'XLiteral') {
                const token = node.value[0];
                const expressionNode: XExpression = {
                    type: 'XExpression',
                    range: token.range,
                    loc: token.loc,
                    parent: directiveNode,
                    expression: null,
                    references: []
                };
                if (token.value.trim()) {
                    // 转换控制语句, for 需要单独处理
                    if (directiveNode.key.name !== 'for') {
                        processExpression(
                            this.parserOptions.script!,
                            this.locationCalculator,
                            expressionNode,
                            token.value
                        );
                    }
                    else {
                        processForExpression(
                            this.parserOptions.script!,
                            this.locationCalculator,
                            expressionNode,
                            token.value
                        );
                    }
                }
                node.value[0] = expressionNode;
            }
        }
        else if (attrName.startsWith('s-') || attrName.startsWith('bind:')) {
            this.reportParseError(node.key, 'x-invalid-directive');
        }

        const values = node.value.map(token => {
            if (token.type === 'Mustache') {

                const mustacheNode: XMustache = {
                    type: 'XMustache',
                    range: token.range,
                    loc: token.loc,
                    parent: node,
                    value: null,
                    startToken: token.startToken,
                    endToken: token.endToken
                };
            
                processMustache(
                    this.parserOptions.script!,
                    this.locationCalculator,
                    mustacheNode,
                    token
                );
                return mustacheNode;
            }

            return token;
        });

        node.value = values;
    }

    /**
     * Handle the start tag token.
     * @param token The token to handle.
     */
    // eslint-disable-next-line complexity
    protected StartTag(token: StartTag): void {
        debug('[swan] StartTag %j', token);

        this.closeCurrentElementIfNecessary(token.name);
        const parent = this.currentNode;

        const element: XElement = {
            type: 'XElement',
            range: [token.range[0], token.range[1]],
            loc: {start: token.loc.start, end: token.loc.end},
            parent,
            name: token.name,
            rawName: token.rawName,
            startTag: {
                type: 'XStartTag',
                range: token.range,
                loc: token.loc,
                parent: DUMMY_PARENT,
                selfClosing: token.selfClosing,
                attributes: token.attributes,
            },
            children: [],
            variables: [],
            endTag: null
        };

        // Setup relations.
        parent.children.push(element);
        element.startTag.parent = element;

        for (const attribute of token.attributes) {
            attribute.parent = element.startTag;
            this.processAttribute(attribute);
        }

        // Check whether the self-closing is valid.
        const isVoid =  SWAN_VOID_ELEMENT_TAGS.has(element.name);
        // only check void elements
        if (!token.selfClosing && isVoid) {
            this.reportParseError(
                token,
                'non-void-html-element-start-tag-with-trailing-solidus',
            );
        }

        // swan supports self-closing elements even if it's not one of void elements.
        if (token.selfClosing || isVoid) {
            this.expressionEnabled = true;
            return;
        }

        // Push to stack.
        this.elementStack.push(element);

        // Update the content type of this element.
        if (element.parent.type === 'XDocument') {
            this.expressionEnabled = true;
        }

        if (SWAN_RCDATA_TAGS.has(element.name)) {
            this.tokenizer.state = 'RCDATA';
        }

        if (SWAN_RAWTEXT_TAGS.has(element.name)) {
            this.tokenizer.state = 'RAWTEXT';
        }
    }

    /**
     * Handle the end tag token.
     * @param token The token to handle.
     */
    protected EndTag(token: EndTag): void {
        debug('[swan] EndTag %j', token);

        const i = findLastIndex(
            this.elementStack,
            el => el.name.toLowerCase() === token.name,
        );
        if (i === -1) {
            this.reportParseError(token, 'x-invalid-end-tag');
            return;
        }

        const element = this.elementStack[i];
        element.endTag = {
            type: 'XEndTag',
            range: token.range,
            loc: token.loc,
            parent: element,
        };

        this.popElementStackUntil(i);
    }

    /**
     * Handle the text token.
     * @param token The token to handle.
     */
    protected Text(token: Text): void {
        debug('[swan] Text %j', token);
        const parent = this.currentNode;
        parent.children.push({
            type: 'XText',
            range: token.range,
            loc: token.loc,
            parent,
            value: token.value,
        });

        // wxs module parse, with no src attribute
        if (parent.type === 'XElement'
            && (parent.name === 'import-sjs' || parent.name === 'filter')
            && parent.children[0].type === 'XText'
            && !parent.startTag.attributes.some(attr => attr.key.name === 'src')) {
                processScriptModule(
                    this.parserOptions.script,
                    this.locationCalculator,
                    parent
                );
        }
    }

    /**
     * Handle the text token.
     * @param token The token to handle.
     */
    protected Mustache(token: Mustache): void {
        debug('[swan] Mustache %j', token);

        const parent = this.currentNode;
        const mustacheNode: XMustache = {
            type: 'XMustache',
            range: token.range,
            loc: token.loc,
            parent,
            value: null,
            startToken: token.startToken,
            endToken: token.endToken
        };
        processMustache(
            this.parserOptions.script!,
            this.locationCalculator,
            mustacheNode,
            token,
        );
        parent.children.push(mustacheNode);
    }
}
