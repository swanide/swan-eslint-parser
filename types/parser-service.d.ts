/**
 * @file parser-service.d.ts
 * @author mengke01(kekee000@gmail.com)
 */
import * as estree from 'estree';
import {HasLocation, HasParent, Token, XDocument} from "./ast";

export namespace ParserServices {

    type SkipOptions = number | ((token: Token) => boolean) | {
        includeComments?: boolean
        filter?: (token: Token) => boolean
        skip?: number
    }
    type CountOptions = number | ((token: Token) => boolean) | {
        includeComments?: boolean
        filter?: (token: Token) => boolean
        count?: number
    }

    type XToken = HasLocation | estree.Node | HasParent;

    class TokenStore {
        private _tokens;
        private _comments;
        private _indexMap;
        constructor(tokens: Token[], comments: Token[]);
        getTokenByRangeStart(offset: number, options?: {
            includeComments: boolean;
        }): Token | null;
        getFirstToken(node: XToken, options?: SkipOptions): Token | null;
        getLastToken(node: XToken, options?: SkipOptions): Token | null;
        getTokenBefore(node: XToken, options?: SkipOptions): Token | null;
        getTokenAfter(node: XToken, options?: SkipOptions): Token | null;
        getFirstTokenBetween(left: XToken, right: XToken, options?: SkipOptions): Token | null;
        getLastTokenBetween(left: XToken, right: XToken, options?: SkipOptions): Token | null;
        getTokenOrCommentBefore(node: XToken, skip?: number): Token | null;
        getTokenOrCommentAfter(node: XToken, skip?: number): Token | null;
        getFirstTokens(node: XToken, options?: CountOptions): Token[];
        getLastTokens(node: XToken, options?: CountOptions): Token[];
        getTokensBefore(node: XToken, options?: CountOptions): Token[];
        getTokensAfter(node: XToken, options?: CountOptions): Token[];
        getFirstTokensBetween(left: XToken, right: XToken, options?: CountOptions): Token[];
        getLastTokensBetween(left: XToken, right: XToken, options?: CountOptions): Token[];
        getTokens(node: XToken, beforeCount?: CountOptions, afterCount?: number): Token[];
        getTokensBetween(left: XToken, right: XToken, padding?: CountOptions): Token[];
        commentsExistBetween(left: XToken, right: XToken): boolean;
        getCommentsBefore(nodeOrToken: XToken): Token[];
        getCommentsAfter(nodeOrToken: XToken): Token[];
        getCommentsInside(node: XToken): Token[];
    }
}

export interface ParserServices {

    /**
     * Define handlers to traverse the template body.
     * @param templateBodyVisitor The template body handlers.
     * @param scriptVisitor The script handlers. This is optional.
     */
    defineTemplateBodyVisitor(
        templateBodyVisitor: { [key: string]: (...args: any) => void },
        scriptVisitor?: unknown
    ): object;

    /**
     * Get the token store of the template body.
     * @returns The token store of template body.
     */
    getTemplateBodyTokenStore(): ParserServices.TokenStore;

    /**
     * Get the root document fragment.
     * @returns The root document fragment.
     */
    getDocumentFragment(): XDocument | null;
}