/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * @copyright 2017 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

/* eslint-disable no-constant-condition, no-param-reassign, no-magic-numbers */

import assert from 'assert';
import {debug, ParseError} from './common';
import {ErrorCode, Token} from '../types/ast';
import {
    APOSTROPHE,
    CARRIAGE_RETURN,
    EOF,
    EQUALS_SIGN,
    EXCLAMATION_MARK,
    GRAVE_ACCENT,
    GREATER_THAN_SIGN,
    HYPHEN_MINUS,
    isControl,
    isLetter,
    isNonCharacter,
    isSurrogate,
    isSurrogatePair,
    isUpperLetter,
    isWhitespace,
    LEFT_CURLY_BRACKET,
    LESS_THAN_SIGN,
    LINE_FEED,
    NULL,
    NULL_REPLACEMENT,
    QUESTION_MARK,
    QUOTATION_MARK,
    RIGHT_CURLY_BRACKET,
    SOLIDUS,
    toLowerCodePoint,
} from './unicode';

/**
 * Enumeration of token types.
 */
export type TokenType =
    | 'HTMLAssociation'
    | 'HTMLBogusComment'
    | 'HTMLComment'
    | 'HTMLEndTagOpen'
    | 'HTMLIdentifier'
    | 'HTMLLiteral'
    | 'HTMLAttrLiteral'
    | 'HTMLQuote'
    | 'HTMLRCDataText'
    | 'HTMLRawText'
    | 'HTMLSelfClosingTagClose'
    | 'HTMLTagClose'
    | 'HTMLTagOpen'
    | 'HTMLText'
    | 'HTMLWhitespace'
    | 'XMustacheStart'
    | 'XMustacheEnd'

/**
 * Enumeration of tokenizer's state types.
 */
export type TokenizerState =
    | 'DATA'
    | 'TAG_OPEN'
    | 'END_TAG_OPEN'
    | 'TAG_NAME'
    | 'RCDATA'
    | 'RCDATA_LESS_THAN_SIGN'
    | 'RCDATA_END_TAG_OPEN'
    | 'RCDATA_END_TAG_NAME'
    | 'RAWTEXT'
    | 'RAWTEXT_LESS_THAN_SIGN'
    | 'RAWTEXT_END_TAG_OPEN'
    | 'RAWTEXT_END_TAG_NAME'
    | 'BEFORE_ATTRIBUTE_NAME'
    | 'ATTRIBUTE_NAME'
    | 'AFTER_ATTRIBUTE_NAME'
    | 'BEFORE_ATTRIBUTE_VALUE'
    | 'ATTRIBUTE_VALUE_DOUBLE_QUOTED'
    | 'ATTRIBUTE_VALUE_SINGLE_QUOTED'
    | 'ATTRIBUTE_VALUE_UNQUOTED'
    | 'AFTER_ATTRIBUTE_VALUE_QUOTED'
    | 'SELF_CLOSING_START_TAG'
    | 'BOGUS_COMMENT'
    | 'MARKUP_DECLARATION_OPEN'
    | 'COMMENT_START'
    | 'COMMENT_START_DASH'
    | 'COMMENT'
    | 'COMMENT_LESS_THAN_SIGN'
    | 'COMMENT_LESS_THAN_SIGN_BANG'
    | 'COMMENT_LESS_THAN_SIGN_BANG_DASH'
    | 'COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH'
    | 'COMMENT_END_DASH'
    | 'COMMENT_END'
    | 'COMMENT_END_BANG'
    | 'X_EXPRESSION_START'
    | 'X_EXPRESSION_END'



/**
 * Tokenizer for HTML.
 */
export default class Tokenizer {
    // Reading
    public readonly text: string;

    public readonly gaps: number[];

    public readonly lineTerminators: number[];

    private lastCodePoint: number;

    private offset: number;

    private column: number;

    private line: number;

    // Tokenizing
    private returnState: TokenizerState;

    private reconsuming: boolean;

    private buffer: number[];

    private committedToken: Token | null;

    // can be rollbacked.
    private provisionalToken: Token | null;

    private currentToken: Token | null;

    private lastTagOpenToken: Token | null;

    private tokenStartOffset: number;

    private tokenStartLine: number;

    private tokenStartColumn: number;

    /**
     * The current state.
     */
    public state: TokenizerState;

    /**
     * Syntax errors.
     */
    public errors: ParseError[];

    /**
     * The flag which enables expression tokens.
     * If this is true, this tokenizer will generate X_EXPRESSION_START and X_EXPRESSION_END tokens.
     */
    public expressionEnabled: boolean;

    /**
     * The flag which enables tag open tokens.
     */
    public tagOpenEnabled: boolean;

    /**
     * Initialize this tokenizer.
     * @param text The source code to tokenize.
     */
    public constructor(text: string) {
        debug('[swan] the source code length: %d', text.length);
        this.text = text;
        this.gaps = [];
        this.lineTerminators = [];
        this.lastCodePoint = NULL;
        this.offset = -1;
        this.column = -1;
        this.line = 1;
        this.state = 'DATA';
        this.returnState = 'DATA';
        this.reconsuming = false;
        this.buffer = [];
        this.errors = [];
        this.committedToken = null;
        this.provisionalToken = null;
        this.currentToken = null;
        this.lastTagOpenToken = null;
        this.tokenStartOffset = -1;
        this.tokenStartColumn = -1;
        this.tokenStartLine = 1;
        this.expressionEnabled = false;
        this.tagOpenEnabled = true;
    }

    /**
     * Get the next token.
     * @returns The next token or null.
     */
    public nextToken(): Token | null {
        let cp = this.lastCodePoint;
        while (
            this.committedToken == null
            && (cp !== EOF || this.reconsuming)
        ) {
            if (this.provisionalToken != null && !this.isProvisionalState()) {
                this.commitProvisionalToken();
                if (this.committedToken != null) {
                    break;
                }
            }

            if (this.reconsuming) {
                this.reconsuming = false;
                cp = this.lastCodePoint;
            }
            else {
                cp = this.consumeNextCodePoint();
            }

            debug('[swan] parse', cp, this.state);
            this.state = this[this.state](cp);
        }

        {
            const token = this.consumeCommittedToken();
            if (token != null) {
                return token;
            }
        }

        assert(cp === EOF);

        if (this.currentToken != null) {
            this.endToken();

            const token = this.consumeCommittedToken();
            if (token != null) {
                return token;
            }
        }
        return this.currentToken;
    }

    /**
     * Consume the last committed token.
     * @returns The last committed token.
     */
    private consumeCommittedToken(): Token | null {
        const token = this.committedToken;
        this.committedToken = null;
        return token;
    }

    /**
     * Consume the next code point.
     * @returns The consumed code point.
     */
    private consumeNextCodePoint(): number {
        if (this.offset >= this.text.length) {
            this.lastCodePoint = EOF;
            return EOF;
        }

        this.offset += this.lastCodePoint >= 0x10000 ? 2 : 1;
        if (this.offset >= this.text.length) {
            this.advanceLocation();
            this.lastCodePoint = EOF;
            return EOF;
        }

        const cp = this.text.codePointAt(this.offset) as number;

        if (
            isSurrogate(this.text.charCodeAt(this.offset))
            && !isSurrogatePair(this.text.charCodeAt(this.offset + 1))
        ) {
            this.reportParseError('surrogate-in-input-stream');
        }
        if (isNonCharacter(cp)) {
            this.reportParseError('noncharacter-in-input-stream');
        }
        if (isControl(cp) && !isWhitespace(cp) && cp !== NULL) {
            this.reportParseError('control-character-in-input-stream');
        }

        // Skip LF to convert CRLF → LF.
        if (this.lastCodePoint === CARRIAGE_RETURN && cp === LINE_FEED) {
            this.lastCodePoint = LINE_FEED;
            this.gaps.push(this.offset);
            return this.consumeNextCodePoint();
        }

        // Update locations.
        this.advanceLocation();
        this.lastCodePoint = cp;

        // To convert CRLF → LF.
        if (cp === CARRIAGE_RETURN) {
            return LINE_FEED;
        }

        return cp;
    }

    /**
     * Advance the current line and column.
     */
    private advanceLocation(): void {
        if (this.lastCodePoint === LINE_FEED) {
            this.lineTerminators.push(this.offset);
            this.line += 1;
            this.column = 0;
        }
        else {
            this.column += this.lastCodePoint >= 0x10000 ? 2 : 1;
        }
    }

    /**
     * Directive reconsuming the current code point as the given state.
     * @param state The next state.
     * @returns The next state.
     */
    private reconsumeAs(state: TokenizerState): TokenizerState {
        this.reconsuming = true;
        return state;
    }

    /**
     * Report an invalid character error.
     * @param code The error code.
     */
    private reportParseError(code: ErrorCode): void {
        const error = ParseError.fromCode(
            code,
            this.offset,
            this.line,
            this.column,
        );
        this.errors.push(error);

        debug('[swan] syntax error:', error.message);
    }

    /**
     * Mark the current location as a start of tokens.
     */
    private setStartTokenMark(): void {
        this.tokenStartOffset = this.offset;
        this.tokenStartLine = this.line;
        this.tokenStartColumn = this.column;
    }

    /**
     * Mark the current location as a start of tokens.
     */
    private clearStartTokenMark(): void {
        this.tokenStartOffset = -1;
    }

    /**
     * Start new token.
     * @param type The type of new token.
     * @returns The new token.
     */
    private startToken(type: TokenType): Token {
        if (this.tokenStartOffset === -1) {
            this.setStartTokenMark();
        }
        const offset = this.tokenStartOffset;
        const line = this.tokenStartLine;
        const column = this.tokenStartColumn;

        if (this.currentToken != null) {
            this.endToken();
        }
        this.tokenStartOffset = -1;

        const token = (this.currentToken = {
            type,
            range: [offset, -1],
            loc: {
                start: {line, column},
                end: {line: -1, column: -1},
            },
            value: '',
        });

        debug('[swan] start token: %d %s', offset, token.type);
        return this.currentToken;
    }

    /**
     * Commit the current token.
     * @returns The ended token.
     */
    private endToken(): Token | null {
        if (this.currentToken == null) {
            throw new Error('Invalid state');
        }
        if (this.tokenStartOffset === -1) {
            this.setStartTokenMark();
        }
        const token = this.currentToken;
        const offset = this.tokenStartOffset;
        const line = this.tokenStartLine;
        const column = this.tokenStartColumn;
        const provisional = this.isProvisionalState();

        this.currentToken = null;
        this.tokenStartOffset = -1;

        token.range[1] = offset;
        token.loc.end.line = line;
        token.loc.end.column = column;

        if (token.range[0] === offset && !provisional) {
            debug(
                '[swan] abandon token: %j %s %j',
                token.range,
                token.type,
                token.value,
            );
            return null;
        }

        if (provisional) {
            if (this.provisionalToken != null) {
                this.commitProvisionalToken();
            }
            this.provisionalToken = token;
            debug(
                '[swan] provisional-commit token: %j %s %j',
                token.range,
                token.type,
                token.value,
            );
        }
        else {
            this.commitToken(token);
        }

        return token;
    }

    /**
     * Commit the given token.
     * @param token The token to commit.
     */
    private commitToken(token: Token): void {
        assert(
            this.committedToken == null,
            'Invalid state: the commited token existed already.',
        );
        debug(
            '[swan] commit token: %j %j %s %j',
            token.range,
            token.loc,
            token.type,
            token.value,
        );

        this.committedToken = token;
        if (token.type === 'HTMLTagOpen') {
            this.lastTagOpenToken = token;
        }
    }

    /**
     * Check whether this is provisional state or not.
     * @returns `true` if this is provisional state.
     */
    private isProvisionalState(): boolean {
        return (
            this.state.startsWith('RCDATA_')
            || this.state.startsWith('RAWTEXT_')
        );
    }

    /**
     * Commit the last provisional committed token.
     */
    private commitProvisionalToken(): void {
        assert(
            this.provisionalToken != null,
            'Invalid state: the provisional token was not found.',
        );

        const token = this.provisionalToken as Token;
        this.provisionalToken = null;

        if (token.range[0] < token.range[1]) {
            this.commitToken(token);
        }
    }

    /**
     * Cancel the current token and set the last provisional committed token as the current token.
     */
    private rollbackProvisionalToken(): void {
        assert(this.currentToken != null);
        assert(this.provisionalToken != null);

        const token = this.currentToken as Token;
        debug('[swan] rollback token: %d %s', token.range[0], token.type);

        this.currentToken = this.provisionalToken as Token;
        this.provisionalToken = null;
    }

    /**
     * Append the given code point into the value of the current token.
     * @param cp The code point to append.
     * @param expected The expected type of the current token.
     */
    private appendTokenValue(cp: number, expected: TokenType | null): void {
        const token = this.currentToken;
        if (token == null || (expected != null && token.type !== expected)) {
            const msg1 = expected ? `"${expected}" type` : 'any token';
            const msg2 = token ? `"${token.type}" type` : 'no token';

            throw new Error(
                `Tokenizer: Invalid state. Expected ${msg1}, but got ${msg2}.`,
            );
        }

        token.value += String.fromCodePoint(cp);
    }

    /**
     * Check whether the current token is appropriate `HTMLEndTagOpen` token.
     * @returns {boolean} `true` if the current token is appropriate `HTMLEndTagOpen` token.
     */
    private isAppropriateEndTagOpen(): boolean {
        return (
            this.currentToken != null
            && this.lastTagOpenToken != null
            && this.currentToken.type === 'HTMLEndTagOpen'
            && this.currentToken.value === this.lastTagOpenToken.value
        );
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#data-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected DATA(cp: number): TokenizerState {
        this.clearStartTokenMark();
        while (true) {
            const type = isWhitespace(cp) ? 'HTMLWhitespace' : 'HTMLText';
            if (this.currentToken != null && this.currentToken.type !== type) {
                this.endToken();
                return this.reconsumeAs(this.state);
            }
            if (this.currentToken == null) {
                this.startToken(type);
            }

            if (cp === LESS_THAN_SIGN && this.tagOpenEnabled) {
                this.setStartTokenMark();
                return 'TAG_OPEN';
            }
            if (cp === LEFT_CURLY_BRACKET && this.expressionEnabled) {
                this.setStartTokenMark();
                this.returnState = 'DATA';
                return 'X_EXPRESSION_START';
            }
            if (cp === RIGHT_CURLY_BRACKET && this.expressionEnabled) {
                this.setStartTokenMark();
                this.returnState = 'DATA';
                return 'X_EXPRESSION_END';
            }
            if (cp === EOF) {
                return 'DATA';
            }

            if (cp === NULL) {
                this.reportParseError('unexpected-null-character');
            }
            this.appendTokenValue(cp, type);

            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#rcdata-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected RCDATA(cp: number): TokenizerState {
        this.clearStartTokenMark();
        while (true) {
            const type = isWhitespace(cp) ? 'HTMLWhitespace' : 'HTMLRCDataText';
            if (this.currentToken != null && this.currentToken.type !== type) {
                this.endToken();
                return this.reconsumeAs(this.state);
            }
            if (this.currentToken == null) {
                this.startToken(type);
            }

            if (cp === LESS_THAN_SIGN) {
                this.setStartTokenMark();
                return 'RCDATA_LESS_THAN_SIGN';
            }
            if (cp === LEFT_CURLY_BRACKET && this.expressionEnabled) {
                this.setStartTokenMark();
                this.returnState = 'RCDATA';
                return 'X_EXPRESSION_START';
            }
            if (cp === RIGHT_CURLY_BRACKET && this.expressionEnabled) {
                this.setStartTokenMark();
                this.returnState = 'RCDATA';
                return 'X_EXPRESSION_END';
            }
            if (cp === EOF) {
                return 'DATA';
            }

            if (cp === NULL) {
                this.reportParseError('unexpected-null-character');
                cp = NULL_REPLACEMENT;
            }
            this.appendTokenValue(cp, type);

            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#rawtext-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected RAWTEXT(cp: number): TokenizerState {
        this.clearStartTokenMark();
        while (true) {
            const type = isWhitespace(cp) ? 'HTMLWhitespace' : 'HTMLRawText';
            if (this.currentToken != null && this.currentToken.type !== type) {
                this.endToken();
                return this.reconsumeAs(this.state);
            }
            if (this.currentToken == null) {
                this.startToken(type);
            }

            if (cp === LESS_THAN_SIGN && this.expressionEnabled) {
                this.setStartTokenMark();
                return 'RAWTEXT_LESS_THAN_SIGN';
            }
            if (cp === LEFT_CURLY_BRACKET && this.expressionEnabled) {
                this.setStartTokenMark();
                this.returnState = 'RAWTEXT';
                return 'X_EXPRESSION_START';
            }
            if (cp === RIGHT_CURLY_BRACKET && this.expressionEnabled) {
                this.setStartTokenMark();
                this.returnState = 'RAWTEXT';
                return 'X_EXPRESSION_END';
            }
            if (cp === EOF) {
                return 'DATA';
            }

            if (cp === NULL) {
                this.reportParseError('unexpected-null-character');
                cp = NULL_REPLACEMENT;
            }
            this.appendTokenValue(cp, type);

            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#tag-open-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected TAG_OPEN(cp: number): TokenizerState {
        if (cp === EXCLAMATION_MARK) {
            return 'MARKUP_DECLARATION_OPEN';
        }
        if (cp === SOLIDUS) {
            return 'END_TAG_OPEN';
        }
        if (isLetter(cp)) {
            this.startToken('HTMLTagOpen');
            return this.reconsumeAs('TAG_NAME');
        }
        if (cp === QUESTION_MARK) {
            this.reportParseError(
                'unexpected-question-mark-instead-of-tag-name',
            );
            this.startToken('HTMLBogusComment');
            return this.reconsumeAs('BOGUS_COMMENT');
        }
        if (cp === EOF) {
            this.clearStartTokenMark();
            this.reportParseError('eof-before-tag-name');
            this.appendTokenValue(LESS_THAN_SIGN, 'HTMLText');
            return 'DATA';
        }

        this.reportParseError('invalid-first-character-of-tag-name');
        this.appendTokenValue(LESS_THAN_SIGN, 'HTMLText');
        return this.reconsumeAs('DATA');
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#end-tag-open-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected END_TAG_OPEN(cp: number): TokenizerState {
        if (isLetter(cp)) {
            this.startToken('HTMLEndTagOpen');
            return this.reconsumeAs('TAG_NAME');
        }
        if (cp === GREATER_THAN_SIGN) {
            // < Commit or abandon the current text token.
            this.endToken();
            this.reportParseError('missing-end-tag-name');
            return 'DATA';
        }
        if (cp === EOF) {
            this.clearStartTokenMark();
            this.reportParseError('eof-before-tag-name');
            this.appendTokenValue(LESS_THAN_SIGN, 'HTMLText');
            this.appendTokenValue(SOLIDUS, 'HTMLText');
            return 'DATA';
        }

        this.reportParseError('invalid-first-character-of-tag-name');
        this.startToken('HTMLBogusComment');
        return this.reconsumeAs('BOGUS_COMMENT');
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#tag-name-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected TAG_NAME(cp: number): TokenizerState {
        while (true) {
            if (isWhitespace(cp)) {
                this.endToken();
                return 'BEFORE_ATTRIBUTE_NAME';
            }
            if (cp === SOLIDUS) {
                this.endToken();
                this.setStartTokenMark();
                return 'SELF_CLOSING_START_TAG';
            }
            if (cp === GREATER_THAN_SIGN) {
                this.startToken('HTMLTagClose');
                return 'DATA';
            }
            if (cp === EOF) {
                this.reportParseError('eof-in-tag');
                return 'DATA';
            }
            if (cp === NULL) {
                this.reportParseError('unexpected-null-character');
                cp = NULL_REPLACEMENT;
            }

            this.appendTokenValue(
                isUpperLetter(cp) ? toLowerCodePoint(cp) : cp,
                null,
            );

            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#rcdata-less-than-sign-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected RCDATA_LESS_THAN_SIGN(cp: number): TokenizerState {
        if (cp === SOLIDUS) {
            this.buffer = [];
            return 'RCDATA_END_TAG_OPEN';
        }

        this.appendTokenValue(LESS_THAN_SIGN, 'HTMLRCDataText');
        return this.reconsumeAs('RCDATA');
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#rcdata-end-tag-open-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected RCDATA_END_TAG_OPEN(cp: number): TokenizerState {
        if (isLetter(cp)) {
            this.startToken('HTMLEndTagOpen');
            return this.reconsumeAs('RCDATA_END_TAG_NAME');
        }

        this.appendTokenValue(LESS_THAN_SIGN, 'HTMLRCDataText');
        this.appendTokenValue(SOLIDUS, 'HTMLRCDataText');
        return this.reconsumeAs('RCDATA');
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#rcdata-end-tag-name-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected RCDATA_END_TAG_NAME(cp: number): TokenizerState {
        while (true) {
            if (isWhitespace(cp) && this.isAppropriateEndTagOpen()) {
                this.endToken();
                return 'BEFORE_ATTRIBUTE_NAME';
            }
            if (cp === SOLIDUS && this.isAppropriateEndTagOpen()) {
                this.endToken();
                this.setStartTokenMark();
                return 'SELF_CLOSING_START_TAG';
            }
            if (cp === GREATER_THAN_SIGN && this.isAppropriateEndTagOpen()) {
                this.startToken('HTMLTagClose');
                return 'DATA';
            }
            if (!isLetter(cp)) {
                this.rollbackProvisionalToken();
                this.appendTokenValue(LESS_THAN_SIGN, 'HTMLRCDataText');
                this.appendTokenValue(SOLIDUS, 'HTMLRCDataText');
                for (const cp1 of this.buffer) {
                    this.appendTokenValue(cp1, 'HTMLRCDataText');
                }
                return this.reconsumeAs('RCDATA');
            }

            this.appendTokenValue(
                isUpperLetter(cp) ? toLowerCodePoint(cp) : cp,
                'HTMLEndTagOpen',
            );
            this.buffer.push(cp);

            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#rawtext-less-than-sign-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected RAWTEXT_LESS_THAN_SIGN(cp: number): TokenizerState {
        if (cp === SOLIDUS) {
            this.buffer = [];
            return 'RAWTEXT_END_TAG_OPEN';
        }

        this.appendTokenValue(LESS_THAN_SIGN, 'HTMLRawText');
        return this.reconsumeAs('RAWTEXT');
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#rawtext-end-tag-open-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected RAWTEXT_END_TAG_OPEN(cp: number): TokenizerState {
        if (isLetter(cp)) {
            this.startToken('HTMLEndTagOpen');
            return this.reconsumeAs('RAWTEXT_END_TAG_NAME');
        }

        this.appendTokenValue(LESS_THAN_SIGN, 'HTMLRawText');
        this.appendTokenValue(SOLIDUS, 'HTMLRawText');
        return this.reconsumeAs('RAWTEXT');
    }

    /**
     * https://html.spec.whatwg.org/multipage/syntax.html#rawtext-end-tag-name-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected RAWTEXT_END_TAG_NAME(cp: number): TokenizerState {
        while (true) {
            if (cp === SOLIDUS && this.isAppropriateEndTagOpen()) {
                this.endToken();
                this.setStartTokenMark();
                return 'SELF_CLOSING_START_TAG';
            }
            if (cp === GREATER_THAN_SIGN && this.isAppropriateEndTagOpen()) {
                this.startToken('HTMLTagClose');
                return 'DATA';
            }
            if (isWhitespace(cp) && this.isAppropriateEndTagOpen()) {
                this.endToken();
                return 'BEFORE_ATTRIBUTE_NAME';
            }
            if (!isLetter(cp) && cp !== HYPHEN_MINUS) {
                this.rollbackProvisionalToken();
                this.appendTokenValue(LESS_THAN_SIGN, 'HTMLRawText');
                this.appendTokenValue(SOLIDUS, 'HTMLRawText');
                for (const cp1 of this.buffer) {
                    this.appendTokenValue(cp1, 'HTMLRawText');
                }
                return this.reconsumeAs('RAWTEXT');
            }

            this.appendTokenValue(
                isUpperLetter(cp) ? toLowerCodePoint(cp) : cp,
                'HTMLEndTagOpen',
            );
            this.buffer.push(cp);

            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#before-attribute-name-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected BEFORE_ATTRIBUTE_NAME(cp: number): TokenizerState {
        while (isWhitespace(cp)) {
            cp = this.consumeNextCodePoint();
        }

        if (cp === SOLIDUS || cp === GREATER_THAN_SIGN || cp === EOF) {
            return this.reconsumeAs('AFTER_ATTRIBUTE_NAME');
        }

        if (cp === EQUALS_SIGN) {
            this.reportParseError(
                'unexpected-equals-sign-before-attribute-name',
            );
            this.startToken('HTMLIdentifier');
            this.appendTokenValue(cp, 'HTMLIdentifier');
            return 'ATTRIBUTE_NAME';
        }

        this.startToken('HTMLIdentifier');
        return this.reconsumeAs('ATTRIBUTE_NAME');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#attribute-name-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected ATTRIBUTE_NAME(cp: number): TokenizerState {
        while (true) {
            if (
                isWhitespace(cp)
                || cp === SOLIDUS
                || cp === GREATER_THAN_SIGN
                || cp === EOF
            ) {
                this.endToken();
                return this.reconsumeAs('AFTER_ATTRIBUTE_NAME');
            }
            if (cp === EQUALS_SIGN) {
                this.startToken('HTMLAssociation');
                return 'BEFORE_ATTRIBUTE_VALUE';
            }

            if (cp === NULL) {
                this.reportParseError('unexpected-null-character');
                cp = NULL_REPLACEMENT;
            }
            if (
                cp === QUOTATION_MARK
                || cp === APOSTROPHE
                || cp === LESS_THAN_SIGN
            ) {
                this.reportParseError('unexpected-character-in-attribute-name');
            }

            this.appendTokenValue(
                isUpperLetter(cp) ? toLowerCodePoint(cp) : cp,
                'HTMLIdentifier',
            );
            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#after-attribute-name-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected AFTER_ATTRIBUTE_NAME(cp: number): TokenizerState {
        while (isWhitespace(cp)) {
            cp = this.consumeNextCodePoint();
        }

        if (cp === SOLIDUS) {
            this.setStartTokenMark();
            return 'SELF_CLOSING_START_TAG';
        }
        if (cp === EQUALS_SIGN) {
            this.startToken('HTMLAssociation');
            return 'BEFORE_ATTRIBUTE_VALUE';
        }
        if (cp === GREATER_THAN_SIGN) {
            this.startToken('HTMLTagClose');
            return 'DATA';
        }

        if (cp === EOF) {
            this.reportParseError('eof-in-tag');
            return 'DATA';
        }

        this.startToken('HTMLIdentifier');
        return this.reconsumeAs('ATTRIBUTE_NAME');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#before-attribute-value-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected BEFORE_ATTRIBUTE_VALUE(cp: number): TokenizerState {
        this.endToken();

        while (isWhitespace(cp)) {
            cp = this.consumeNextCodePoint();
        }

        if (cp === GREATER_THAN_SIGN) {
            this.reportParseError('missing-attribute-value');
            this.startToken('HTMLTagClose');
            return 'DATA';
        }


        if (cp === QUOTATION_MARK) {
            this.startToken('HTMLQuote');
            this.appendTokenValue(cp, null);
            return 'ATTRIBUTE_VALUE_DOUBLE_QUOTED';
        }

        if (cp === APOSTROPHE) {
            this.startToken('HTMLQuote');
            this.appendTokenValue(cp, null);
            return 'ATTRIBUTE_VALUE_SINGLE_QUOTED';
        }

        this.startToken('HTMLLiteral');
        return this.reconsumeAs('ATTRIBUTE_VALUE_UNQUOTED');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#attribute-value-(double-quoted)-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected ATTRIBUTE_VALUE_DOUBLE_QUOTED(cp: number): TokenizerState {
        this.clearStartTokenMark();
        const tokenType = 'HTMLAttrLiteral';

        while (true) {
            if (this.currentToken != null && this.currentToken.type !== tokenType) {
                this.endToken();
                return this.reconsumeAs(this.state);
            }

            if (this.currentToken == null) {
                this.startToken(tokenType);
            }

            if (cp === LEFT_CURLY_BRACKET) {
                this.setStartTokenMark();
                this.returnState = 'ATTRIBUTE_VALUE_DOUBLE_QUOTED';
                return 'X_EXPRESSION_START';
            }

            if (cp === RIGHT_CURLY_BRACKET || cp === EQUALS_SIGN) {
                this.setStartTokenMark();
                this.returnState = 'ATTRIBUTE_VALUE_DOUBLE_QUOTED';
                return 'X_EXPRESSION_END';
            }

            if (cp === QUOTATION_MARK) {
                this.startToken('HTMLQuote');
                this.appendTokenValue(cp, null);
                return 'AFTER_ATTRIBUTE_VALUE_QUOTED';
            }

            if (cp === EOF) {
                return 'DATA';
            }

            // allow line break
            // if (cp === LINE_FEED) {
            //     this.reportParseError('unexpected-line-break');
            // }

            if (cp === NULL) {
                this.reportParseError('unexpected-null-character');
            }

            this.appendTokenValue(cp, tokenType);
            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#attribute-value-(single-quoted)-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected ATTRIBUTE_VALUE_SINGLE_QUOTED(cp: number): TokenizerState {
        this.clearStartTokenMark();
        const tokenType = 'HTMLAttrLiteral';

        while (true) {
            if (this.currentToken != null && this.currentToken.type !== tokenType) {
                this.endToken();
                return this.reconsumeAs(this.state);
            }

            if (this.currentToken == null) {
                this.startToken(tokenType);
            }

            if (cp === LEFT_CURLY_BRACKET) {
                this.setStartTokenMark();
                this.returnState = 'ATTRIBUTE_VALUE_SINGLE_QUOTED';
                return 'X_EXPRESSION_START';
            }

            if (cp === RIGHT_CURLY_BRACKET || cp === EQUALS_SIGN) {
                this.setStartTokenMark();
                this.returnState = 'ATTRIBUTE_VALUE_SINGLE_QUOTED';
                return 'X_EXPRESSION_END';
            }

            if (cp === APOSTROPHE) {
                this.startToken('HTMLQuote');
                this.appendTokenValue(cp, null);
                return 'AFTER_ATTRIBUTE_VALUE_QUOTED';
            }

            if (cp === EOF) {
                return 'DATA';
            }

            if (cp === LINE_FEED) {
                this.reportParseError('unexpected-line-break');
            }

            if (cp === NULL) {
                this.reportParseError('unexpected-null-character');
            }

            this.appendTokenValue(cp, tokenType);
            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#attribute-value-(unquoted)-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected ATTRIBUTE_VALUE_UNQUOTED(cp: number): TokenizerState {
        this.reportParseError('attribute-value-invalid-unquoted');
        while (true) {
            if (isWhitespace(cp)) {
                this.endToken();
                return 'BEFORE_ATTRIBUTE_NAME';
            }

            if (cp === GREATER_THAN_SIGN) {
                this.startToken('HTMLTagClose');
                return 'DATA';
            }

            if (cp === NULL) {
                this.reportParseError('unexpected-null-character');
                cp = NULL_REPLACEMENT;
            }
            if (
                cp === QUOTATION_MARK
                || cp === APOSTROPHE
                || cp === LESS_THAN_SIGN
                || cp === EQUALS_SIGN
                || cp === GRAVE_ACCENT
            ) {
                this.reportParseError(
                    'unexpected-character-in-unquoted-attribute-value',
                );
            }
            if (cp === EOF) {
                this.reportParseError('eof-in-tag');
                return 'DATA';
            }

            this.appendTokenValue(cp, 'HTMLLiteral');
            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#after-attribute-value-(quoted)-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected AFTER_ATTRIBUTE_VALUE_QUOTED(cp: number): TokenizerState {
        this.endToken();

        if (isWhitespace(cp)) {
            return 'BEFORE_ATTRIBUTE_NAME';
        }
        if (cp === SOLIDUS) {
            this.setStartTokenMark();
            return 'SELF_CLOSING_START_TAG';
        }
        if (cp === GREATER_THAN_SIGN) {
            this.startToken('HTMLTagClose');
            return 'DATA';
        }

        if (cp === EOF) {
            this.reportParseError('eof-in-tag');
            return 'DATA';
        }

        this.reportParseError('missing-whitespace-between-attributes');
        return this.reconsumeAs('BEFORE_ATTRIBUTE_NAME');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#self-closing-start-tag-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected SELF_CLOSING_START_TAG(cp: number): TokenizerState {
        if (cp === GREATER_THAN_SIGN) {
            this.startToken('HTMLSelfClosingTagClose');

            // swan supports self-closing elements.
            // So don't switch to RCDATA/RAWTEXT from any elements.
            return 'DATA';
        }

        if (cp === EOF) {
            this.reportParseError('eof-in-tag');
            return 'DATA';
        }

        this.reportParseError('unexpected-solidus-in-tag');
        this.clearStartTokenMark();
        return this.reconsumeAs('BEFORE_ATTRIBUTE_NAME');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#bogus-comment-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected BOGUS_COMMENT(cp: number): TokenizerState {
        while (true) {
            if (cp === GREATER_THAN_SIGN) {
                return 'DATA';
            }

            if (cp === EOF) {
                return 'DATA';
            }
            if (cp === NULL) {
                cp = NULL_REPLACEMENT;
            }
            this.appendTokenValue(cp, null);

            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#markup-declaration-open-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected MARKUP_DECLARATION_OPEN(cp: number): TokenizerState {
        if (cp === HYPHEN_MINUS && this.text[this.offset + 1] === '-') {
            this.offset += 1;
            this.column += 1;

            this.startToken('HTMLComment');
            return 'COMMENT_START';
        }

        this.reportParseError('incorrectly-opened-comment');
        this.startToken('HTMLBogusComment');
        return this.reconsumeAs('BOGUS_COMMENT');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-start-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT_START(cp: number): TokenizerState {
        if (cp === HYPHEN_MINUS) {
            return 'COMMENT_START_DASH';
        }
        if (cp === GREATER_THAN_SIGN) {
            this.reportParseError('abrupt-closing-of-empty-comment');
            return 'DATA';
        }

        return this.reconsumeAs('COMMENT');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-start-dash-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT_START_DASH(cp: number): TokenizerState {
        if (cp === HYPHEN_MINUS) {
            return 'COMMENT_END';
        }

        if (cp === GREATER_THAN_SIGN) {
            this.reportParseError('abrupt-closing-of-empty-comment');
            return 'DATA';
        }
        if (cp === EOF) {
            this.reportParseError('eof-in-comment');
            return 'DATA';
        }

        this.appendTokenValue(HYPHEN_MINUS, 'HTMLComment');
        return this.reconsumeAs('COMMENT');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT(cp: number): TokenizerState {
        while (true) {
            if (cp === LESS_THAN_SIGN) {
                this.appendTokenValue(LESS_THAN_SIGN, 'HTMLComment');
                return 'COMMENT_LESS_THAN_SIGN';
            }
            if (cp === HYPHEN_MINUS) {
                return 'COMMENT_END_DASH';
            }

            if (cp === NULL) {
                this.reportParseError('unexpected-null-character');
                cp = NULL_REPLACEMENT;
            }
            if (cp === EOF) {
                this.reportParseError('eof-in-comment');
                return 'DATA';
            }

            this.appendTokenValue(cp, 'HTMLComment');
            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-less-than-sign-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT_LESS_THAN_SIGN(cp: number): TokenizerState {
        while (true) {
            if (cp === EXCLAMATION_MARK) {
                this.appendTokenValue(cp, 'HTMLComment');
                return 'COMMENT_LESS_THAN_SIGN_BANG';
            }
            if (cp !== LESS_THAN_SIGN) {
                return this.reconsumeAs('COMMENT');
            }

            this.appendTokenValue(cp, 'HTMLComment');
            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-less-than-sign-bang-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT_LESS_THAN_SIGN_BANG(cp: number): TokenizerState {
        if (cp === HYPHEN_MINUS) {
            return 'COMMENT_LESS_THAN_SIGN_BANG_DASH';
        }
        return this.reconsumeAs('COMMENT');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-less-than-sign-bang-dash-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT_LESS_THAN_SIGN_BANG_DASH(cp: number): TokenizerState {
        if (cp === HYPHEN_MINUS) {
            return 'COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH';
        }
        return this.reconsumeAs('COMMENT_END_DASH');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-less-than-sign-bang-dash-dash-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH(
        cp: number,
    ): TokenizerState {
        if (cp !== GREATER_THAN_SIGN && cp !== EOF) {
            this.reportParseError('nested-comment');
        }
        return this.reconsumeAs('COMMENT_END');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-end-dash-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT_END_DASH(cp: number): TokenizerState {
        if (cp === HYPHEN_MINUS) {
            return 'COMMENT_END';
        }

        if (cp === EOF) {
            this.reportParseError('eof-in-comment');
            return 'DATA';
        }

        this.appendTokenValue(HYPHEN_MINUS, 'HTMLComment');
        return this.reconsumeAs('COMMENT');
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-end-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT_END(cp: number): TokenizerState {
        while (true) {
            if (cp === GREATER_THAN_SIGN) {
                return 'DATA';
            }
            if (cp === EXCLAMATION_MARK) {
                return 'COMMENT_END_BANG';
            }

            if (cp === EOF) {
                this.reportParseError('eof-in-comment');
                return 'DATA';
            }

            this.appendTokenValue(HYPHEN_MINUS, 'HTMLComment');

            if (cp !== HYPHEN_MINUS) {
                this.appendTokenValue(HYPHEN_MINUS, 'HTMLComment');
                return this.reconsumeAs('COMMENT');
            }
            cp = this.consumeNextCodePoint();
        }
    }

    /**
     * https://html.spec.whatwg.org/multipage/parsing.html#comment-end-bang-state
     * @param cp The current code point.
     * @returns The next state.
     */
    protected COMMENT_END_BANG(cp: number): TokenizerState {
        if (cp === HYPHEN_MINUS) {
            this.appendTokenValue(HYPHEN_MINUS, 'HTMLComment');
            this.appendTokenValue(EXCLAMATION_MARK, 'HTMLComment');
            return 'COMMENT_END_DASH';
        }

        if (cp === GREATER_THAN_SIGN) {
            this.reportParseError('incorrectly-closed-comment');
            return 'DATA';
        }
        if (cp === EOF) {
            this.reportParseError('eof-in-comment');
            return 'DATA';
        }

        this.appendTokenValue(HYPHEN_MINUS, 'HTMLComment');
        this.appendTokenValue(EXCLAMATION_MARK, 'HTMLComment');
        return this.reconsumeAs('COMMENT');
    }

    /**
     * Original state.
     * Create `{{ `token.
     * @param cp The current code point.
     * @returns The next state.
     */
    protected X_EXPRESSION_START(cp: number): TokenizerState {
        // {{
        if (cp === LEFT_CURLY_BRACKET) {
            this.startToken('XMustacheStart');
            this.appendTokenValue(LEFT_CURLY_BRACKET, null);
            this.appendTokenValue(LEFT_CURLY_BRACKET, null);
            this.tagOpenEnabled = false;
            return this.returnState;
        }
        // {=
        else if (cp === EQUALS_SIGN 
            && (this.returnState === 'ATTRIBUTE_VALUE_DOUBLE_QUOTED' || this.returnState === 'ATTRIBUTE_VALUE_SINGLE_QUOTED')) {
            this.startToken('XMustacheStart');
            this.appendTokenValue(LEFT_CURLY_BRACKET, null);
            this.appendTokenValue(EQUALS_SIGN, null);
            return this.returnState;
        }
        this.appendTokenValue(LEFT_CURLY_BRACKET, null);
        return this.reconsumeAs(this.returnState);
    }

    /**
     * Create `}} `token.
     * @param cp The current code point.
     * @returns The next state.
     */
    protected X_EXPRESSION_END(cp: number): TokenizerState {
        // 匹配 style="{{{color: '#ccc'}}}"
        if (cp === RIGHT_CURLY_BRACKET && this.text.codePointAt(this.offset + 1) !== RIGHT_CURLY_BRACKET) {
            this.startToken('XMustacheEnd');
            this.appendTokenValue(this.text.codePointAt(this.offset - 1), null);
            this.appendTokenValue(RIGHT_CURLY_BRACKET, null);
            this.tagOpenEnabled = true;
            return this.returnState;
        }

        this.appendTokenValue(this.text.codePointAt(this.offset - 1), null);
        return this.reconsumeAs(this.returnState);
    }
}

/* eslint-enable no-constant-condition, no-param-reassign */
