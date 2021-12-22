/**
 * @file common utils
 * @author mengke01(kekee000@gmail.com)
 */

import debugFactory from 'debug';
import {ErrorCode, Location } from '../types/ast';
export const debug = debugFactory('@baidu/swan-eslint-parser');

function isAcornStyleParseError(
    x: any,
): x is { message: string; pos: number; loc: Location } {
    return (
        typeof x.message === 'string'
        && typeof x.pos === 'number'
        && typeof x.loc === 'object'
        && x.loc !== null
        && typeof x.loc.line === 'number'
        && typeof x.loc.column === 'number'
    );
}

export class ParseError extends SyntaxError {
    public code?: ErrorCode;

    public index: number;

    public lineNumber: number;

    public column: number;

    /**
     * Create new parser error object.
     * @param code The error code. See also: https://html.spec.whatwg.org/multipage/parsing.html#parse-errors
     * @param offset The offset number of this error.
     * @param line The line number of this error.
     * @param column The column number of this error.
     */
    public static fromCode(
        code: ErrorCode,
        offset: number,
        line: number,
        column: number,
    ): ParseError {
        return new ParseError(code, code, offset, line, column);
    }

    /**
     * Normalize the error object.
     * @param x The error object to normalize.
     */
    public static normalize(x: any): ParseError | null {
        if (ParseError.isParseError(x)) {
            return x;
        }
        if (isAcornStyleParseError(x)) {
            return new ParseError(
                x.message,
                void 0,
                x.pos,
                x.loc.line,
                x.loc.column,
            );
        }
        return null;
    }

    /**
     * Initialize this ParseError instance.
     * @param message The error message.
     * @param code The error code. See also: https://html.spec.whatwg.org/multipage/parsing.html#parse-errors
     * @param index The offset number of this error.
     * @param line The line number of this error.
     * @param column The column number of this error.
     */
    public constructor(
        message: string,
        code: ErrorCode | undefined,
        index: number,
        lineNumber: number,
        column: number,
    ) {
        super(message);
        this.code = code;
        this.index = index;
        this.lineNumber = lineNumber;
        this.column = column;
    }

    /**
     * Type guard for ParseError.
     * @param x The value to check.
     * @returns `true` if the value has `message`, `pos`, `loc` properties.
     */
    public static isParseError(x: any): x is ParseError {
        return (
            x instanceof ParseError
            || (typeof x.message === 'string'
                && typeof x.index === 'number'
                && typeof x.lineNumber === 'number'
                && typeof x.column === 'number')
        );
    }
}
