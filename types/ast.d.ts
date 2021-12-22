/**
 * @file ast 类型定义
 * @author mengke01(kekee000@gmail.com)
 */

import * as script from './script';

export interface Location {
    line: number;
    column: number;
}

export interface LocationRange {
    start: Location;
    end: Location;
}

export type Offset = number;

export type OffsetRange = [Offset, Offset];

export interface Token extends HasLocation {
    type: string;
    value: string;
}

export interface HasLocation {
    range: OffsetRange;
    loc: LocationRange;
    start?: number;
    end?: number;
}

export interface HasParent {
    parent?: Node | null;
}


/**
 * The property which has concrete information.
 */
export interface HasConcreteInfo {
    tokens: Token[];
    comments: Token[];
    errors: ParseError[];
}

export type SwanForExpression = {
    type: 'SwanForExpression';
    start: number;
    end: number;
    right: script.Identifier;
    left: script.Identifier;
    index: script.Identifier;
    trackBy: script.Identifier;
} & HasLocation & HasParent;


export type XAttributeValue = (XLiteral | XMustache | Mustache | XExpression)[];

export interface XMustache extends HasLocation, HasParent {
    type: 'XMustache';
    parent: XAttribute | XDirective | XElement | XDocument;
    startToken: Token;
    endToken: Token;
    value: XExpression;
}

export interface Mustache extends HasLocation {
    type: 'Mustache';
    value: string;
    startToken: Token;
    endToken: Token;
}

export interface XLiteral extends HasLocation, HasParent {
    type: 'XLiteral';
    parent: XAttribute;
    value: string;
}

export interface XDirective extends HasLocation, HasParent {
    type: 'XDirective';
    parent: XStartTag;
    key: XDirectiveKey;
    value: XAttributeValue;
}

export interface XIdentifier extends HasLocation, HasParent {
    type: 'XIdentifier';
    parent: XAttribute;
    name: string;
    rawName: string;
}

export type ControlDirectivePrefix = 's-';
export type EventDirectivePrefix = 'bind' | 'catch' | 'capture-bind' | 'capture-catch';

export interface XDirectiveKey extends HasLocation, HasParent {
    type: 'XDirectiveKey';
    parent: XDirective;
    name: string;
    prefix: ControlDirectivePrefix | EventDirectivePrefix;
    rawPrefix: string;
    rawName: string;
}

export interface XAttribute extends HasLocation, HasParent {
    type: 'XAttribute';
    parent: XStartTag;
    key: XIdentifier;
    value: XAttributeValue;
}

export interface XText extends HasLocation, HasParent {
    type: 'XText';
    parent: XDocument | XElement;
    value: string;
}

export interface ParseError extends SyntaxError {
    code?: ErrorCode;
    index: number;
    lineNumber: number;
    column: number;
}

export interface XDocument extends HasLocation, HasParent {
    type: 'XDocument';
    xmlType: 'swan' | 'unknown';
    parent: null;
    children: (XElement | XText | XMustache)[];
    tokens: Token[];
    comments: Token[];
    errors: ParseError[];
}


export interface XElement extends HasLocation, HasParent {
    type: 'XElement';
    parent: XElement | XDocument;
    name: string;
    rawName: string;
    startTag: XStartTag;
    children: (XElement | XText | XMustache | XModule)[];
    endTag: XEndTag | null;
    variables: script.Variable[];
}

export interface XExpression extends HasLocation, HasParent {
    type: 'XExpression';
    parent: XDirective | XMustache;
    expression: script.Expression | SwanForExpression | null;
    references: script.Reference[];
}

export interface XModule extends HasLocation, HasParent {
    type: 'XModule';
    parent: XElement;
    body: (script.Statement | script.ModuleDeclaration)[] | null;
    references: script.Reference[];
}

export type XNode =
    | XAttribute
    | XDirective
    | XDirectiveKey
    | XElement
    | XEndTag
    | XIdentifier
    | XLiteral
    | XStartTag
    | XText
    | XMustache
    | XDocument
    | XExpression
    | XModule

export type ScriptNode = script.ScriptNode;
export type Node = ScriptNode | XNode;

export type ScriptProgram = script.ScriptProgram;

export interface XStartTag extends HasLocation, HasParent {
    type: 'XStartTag';
    parent: XElement;
    selfClosing: boolean;
    attributes: (XAttribute | XDirective)[];
}

/**
 * End tag nodes.
 */
export interface XEndTag extends HasLocation, HasParent {
    type: 'XEndTag';
    parent: XElement;
}

/**
 * The error codes of HTML syntax errors.
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-errors
 */
export type ErrorCode =
    | 'abrupt-closing-of-empty-comment'
    | 'control-character-in-input-stream'
    | 'eof-before-tag-name'
    | 'eof-in-comment'
    | 'eof-in-tag'
    | 'incorrectly-closed-comment'
    | 'incorrectly-opened-comment'
    | 'invalid-first-character-of-tag-name'
    | 'missing-attribute-value'
    | 'missing-end-tag-name'
    | 'missing-whitespace-between-attributes'
    | 'nested-comment'
    | 'noncharacter-in-input-stream'
    | 'surrogate-in-input-stream'
    | 'unexpected-character-in-attribute-name'
    | 'unexpected-character-in-unquoted-attribute-value'
    | 'unexpected-equals-sign-before-attribute-name'
    | 'unexpected-null-character'
    | 'unexpected-question-mark-instead-of-tag-name'
    | 'unexpected-solidus-in-tag'
    | 'end-tag-with-attributes'
    | 'duplicate-attribute'
    | 'non-void-html-element-start-tag-with-trailing-solidus'
    | 'attribute-value-invalid-unquoted'
    | 'unexpected-line-break'
    | 'missing-expression-end-tag'
    | 'missing-end-tag'
    | 'x-invalid-end-tag'
    | 'x-invalid-directive'
    | 'x-expression-error'
    | 'unreachable';