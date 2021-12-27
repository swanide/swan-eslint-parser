/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * @copyright 2017 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
import * as escope from 'eslint-scope';
import {
    Identifier,
    ScriptProgram,
    Reference
} from '../../types/script';
import { getFallbackKeys } from './traverse';


/**
 * Check whether the given reference is unique in the belonging array.
 * @param reference The current reference to check.
 * @param index The index of the reference.
 * @param references The belonging array of the reference.
 */
function isUnique(
    reference: escope.Reference,
    index: number,
    references: escope.Reference[],
): boolean {
    return (
        index === 0 || reference.identifier !== references[index - 1].identifier
    );
}


/**
 * Transform the given reference object.
 * @param reference The source reference object.
 * @returns The transformed reference object.
 */
function transformReference(reference: escope.Reference): Reference {
    const ret: Reference = {
        id: reference.identifier as Identifier,
        mode: reference.isReadOnly()
            ? 'r'
            : reference.isWriteOnly()
                ? 'w'
                : /* otherwise */ 'rw',
        variable: null,
    };
    Object.defineProperty(ret, 'variable', {enumerable: false});

    return ret;
}


/**
 *
 * @param ast
 * @param parserOptions
 */
function analyze(ast: ScriptProgram, parserOptions: any): escope.Scope {
    const ecmaVersion = parserOptions.ecmaVersion || 2017;
    const ecmaFeatures = parserOptions.ecmaFeatures || {};
    const sourceType = parserOptions.sourceType || 'script';
    const result = escope.analyze(ast, {
        ignoreEval: true,
        nodejsScope: false,
        impliedStrict: ecmaFeatures.impliedStrict,
        ecmaVersion,
        sourceType,
        fallback: getFallbackKeys as any,
    });

    return result.globalScope;
}

/**
 * Analyze the external references of the given AST.
 * @param {ASTNode} ast The root node to analyze.
 * @returns {Reference[]} The reference objects of external references.
 */
export function analyzeExternalReferences(
    ast: ScriptProgram,
    parserOptions: any,
): Reference[] {
    const scope = analyze(ast, parserOptions);
    return scope.through.filter(isUnique).map(transformReference);
}

