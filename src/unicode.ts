/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * @copyright 2017 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

export const EOF = -1
export const NULL = 0x00
/**
 * \t
 */
export const TABULATION = 0x09
/**
 * \r
 */
export const CARRIAGE_RETURN = 0x0D
/**
 * \n
 */
export const LINE_FEED = 0x0A
/**
 * \f
 */
export const FORM_FEED = 0x0C
/**
 * whitespace
 */
export const SPACE = 0x20
/**
 * !
 */
export const EXCLAMATION_MARK = 0x21

/**
 * double quote "
 */
export const QUOTATION_MARK = 0x22
/**
 * #
 */
export const NUMBER_SIGN = 0x23

/**
 * single quote '
 */
export const APOSTROPHE = 0x27
/**
 * -
 */
export const HYPHEN_MINUS = 0x2D
/**
 * /
 */
export const SOLIDUS = 0x2F
/**
 * &lt;
 */
export const LESS_THAN_SIGN = 0x3C
/**
 * =
 */
export const EQUALS_SIGN = 0x3D
/**
 * &gt;
 */
export const GREATER_THAN_SIGN = 0x3E
/**
 * ?
 */
export const QUESTION_MARK = 0x3F
export const LATIN_CAPITAL_A = 0x41
export const LATIN_CAPITAL_Z = 0x5A
/**
 * [
 */
export const LEFT_SQUARE_BRACKET = 0x5B
/**
 * ]
 */
export const RIGHT_SQUARE_BRACKET = 0x5D
/**
 * `
 */
export const GRAVE_ACCENT = 0x60
export const LATIN_SMALL_A = 0x61
export const LATIN_SMALL_Z = 0x7A
/**
 * {
 */
export const LEFT_CURLY_BRACKET = 0x7B
/**
 * }
 */
export const RIGHT_CURLY_BRACKET = 0x7D
export const NULL_REPLACEMENT = 0xFFFD

/**
 * Check whether the code point is a whitespace.
 * @param cp The code point to check.
 * @returns `true` if the code point is a whitespace.
 */
export function isWhitespace(cp: number): boolean {
    return cp === TABULATION || cp === LINE_FEED || cp === FORM_FEED || cp === CARRIAGE_RETURN || cp === SPACE
}

/**
 * Check whether the code point is an uppercase letter character.
 * @param cp The code point to check.
 * @returns `true` if the code point is an uppercase letter character.
 */
export function isUpperLetter(cp: number): boolean {
    return cp >= LATIN_CAPITAL_A && cp <= LATIN_CAPITAL_Z
}

/**
 * Check whether the code point is a lowercase letter character.
 * @param cp The code point to check.
 * @returns `true` if the code point is a lowercase letter character.
 */
export function isLowerLetter(cp: number): boolean {
    return cp >= LATIN_SMALL_A && cp <= LATIN_SMALL_Z
}

/**
 * Check whether the code point is a letter character.
 * @param cp The code point to check.
 * @returns `true` if the code point is a letter character.
 */
export function isLetter(cp: number): boolean {
    return isLowerLetter(cp) || isUpperLetter(cp)
}

/**
 * Check whether the code point is a control character.
 * @param cp The code point to check.
 * @returns `true` if the code point is a control character.
 */
export function isControl(cp: number): boolean {
    return (cp >= 0 && cp <= 0x1F) || (cp >= 0x7F && cp <= 0x9F)
}

/**
 * Check whether the code point is a surrogate character.
 * @param cp The code point to check.
 * @returns `true` if the code point is a surrogate character.
 */
export function isSurrogate(cp: number): boolean {
    return cp >= 0xD800 && cp <= 0xDFFF
}

/**
 * Check whether the code point is a surrogate pair character.
 * @param cp The code point to check.
 * @returns `true` if the code point is a surrogate pair character.
 */
export function isSurrogatePair(cp: number): boolean {
    return cp >= 0xDC00 && cp <= 0xDFFF
}

/**
 * Check whether the code point is a surrogate character.
 * @param cp The code point to check.
 * @returns `true` if the code point is a surrogate character.
 */
export function isNonCharacter(cp: number): boolean {
    return (
        (cp >= 0xFDD0 && cp <= 0xFDEF) ||
        ((cp & 0xFFFE) === 0xFFFE && cp <= 0x10FFFF)
    )
}

// export function isReservedCodePoint(cp: number): boolean {
//     return (cp >= 0xD800 && cp <= 0xDFFF) || cp > 0x10FFFF
// }

/**
 * Convert the given character to lowercases.
 * @param cp The code point to convert.
 * @returns Converted code point.
 */
export function toLowerCodePoint(cp: number): number {
    return cp + 0x0020
}
