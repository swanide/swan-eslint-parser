/**
 * @file parser 类型定义
 * @author mengke01(kekee000@gmail.com)
 */

export interface ParserOptions {

    /**
     * tag should has close tag
     */
    noOpenTag: boolean;

    /**
     * script parser options, default acron
     */
    script?: ScriptParserOptions
}

export interface ScriptParserOptions {
    parser: 'acorn' | 'espree' | string;
    ecmaVersion?: 2018 | 2019 | 2020;
    range?: boolean;
    loc?: boolean;
    tokens?: boolean;
    comments?: boolean;
}