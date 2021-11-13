/**
 * @file eslint ast
 * @author mengke01(kekee000@gmail.com)
 */

import * as ast from '../../types/ast';
import * as script from '../../types/script';

export type Node = ast.Node & ast.HasParent;
export type Token = ast.Token;
export type ESLintProgram = script.ScriptProgram;
export type XDocument = ast.XDocument;
export type HasLocation = ast.HasLocation;