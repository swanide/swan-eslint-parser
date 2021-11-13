/**
 * @file script
 * @author mengke01(kekee000@gmail.com)
 */
import {HasLocation, HasParent, Token, ParseError, XDocument} from './ast';
import * as estree from 'estree';

export interface ExtendedProgram {
    ast: ScriptProgram;
    services?: Record<string, unknown>;
    visitorKeys?: { [type: string]: string[] };
    scopeManager?: ScopeManager;
}

export interface ScriptProgram extends HasLocation, HasParent {
    type: 'Program';
    sourceType: 'script' | 'module';
    body: estree.Program['body'];
    templateBody?: XDocument;
    tokens?: Token[];
    comments?: Token[];
    errors?: ParseError[];
}

export interface ScopeManager {
    scopes: Scope[]
    globalScope: Scope
    acquire(node: estree.Node, inner: boolean): Scope | null
    acquireAll(node: estree.Node): Scope[]
}

export interface Scope {
    block: estree.Node
    childScopes: Scope[]
    directCallToEcalScope: boolean
    dynamic: boolean
    functionExpressionScope: boolean
    isStrict: boolean
    references: Reference[]
    set: Map<string, Variable>
    taints: Map<string, boolean>
    thisFound: boolean
    through: Reference[]
    type: string
    upper: Scope | null
    variables: Variable[]
    variableScope: Scope
}

export interface ExtendedProgram {
    ast: ScriptProgram;
    services?: Record<string, unknown>;
    visitorKeys?: { [type: string]: string[] };
    scopeManager?: ScopeManager;
}

export interface Identifier extends HasLocation, HasParent {
    type: 'Identifier';
    name: string;
}

export interface Reference {
    id: Identifier;
    mode: 'rw' | 'r' | 'w';
    variable: Variable | null;
}


export interface Variable {
    id: Identifier;
    kind: 'for' | 'scope';
    references: Reference[];
}

/**
 * Type of variable references.
 */
export interface Reference {
    id: Identifier;
    mode: 'rw' | 'r' | 'w';
    variable: Variable | null;
}


export type ScriptNode = estree.Node | ScriptProgram;
export type CallExpression = estree.CallExpression;
export type Expression = estree.Expression;
export type Statement = estree.Statement;
export type ModuleDeclaration = estree.ModuleDeclaration;
export type ExpressionStatement = estree.ExpressionStatement;
export type SpreadElement = estree.SpreadElement;
export type ArrayExpression = estree.ArrayExpression;