/**
 * @file parser-service.d.ts
 * @author mengke01(kekee000@gmail.com)
 */

import {HasLocation, Token, XDocument} from "./ast";

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

    class TokenStore {
        private _tokens;
        private _comments;
        private _indexMap;
        constructor(tokens: Token[], comments: Token[]);
        getTokenByRangeStart(offset: number, options?: {
            includeComments: boolean;
        }): Token | null;
        getFirstToken(node: HasLocation, options?: SkipOptions): Token | null;
        getLastToken(node: HasLocation, options?: SkipOptions): Token | null;
        getTokenBefore(node: HasLocation, options?: SkipOptions): Token | null;
        getTokenAfter(node: HasLocation, options?: SkipOptions): Token | null;
        getFirstTokenBetween(left: HasLocation, right: HasLocation, options?: SkipOptions): Token | null;
        getLastTokenBetween(left: HasLocation, right: HasLocation, options?: SkipOptions): Token | null;
        getTokenOrCommentBefore(node: HasLocation, skip?: number): Token | null;
        getTokenOrCommentAfter(node: HasLocation, skip?: number): Token | null;
        getFirstTokens(node: HasLocation, options?: CountOptions): Token[];
        getLastTokens(node: HasLocation, options?: CountOptions): Token[];
        getTokensBefore(node: HasLocation, options?: CountOptions): Token[];
        getTokensAfter(node: HasLocation, options?: CountOptions): Token[];
        getFirstTokensBetween(left: HasLocation, right: HasLocation, options?: CountOptions): Token[];
        getLastTokensBetween(left: HasLocation, right: HasLocation, options?: CountOptions): Token[];
        getTokens(node: HasLocation, beforeCount?: CountOptions, afterCount?: number): Token[];
        getTokensBetween(left: HasLocation, right: HasLocation, padding?: CountOptions): Token[];
        commentsExistBetween(left: HasLocation, right: HasLocation): boolean;
        getCommentsBefore(nodeOrToken: HasLocation): Token[];
        getCommentsAfter(nodeOrToken: HasLocation): Token[];
        getCommentsInside(node: HasLocation): Token[];
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