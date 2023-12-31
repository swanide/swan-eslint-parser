/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * @copyright 2017 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
import Evk, {VisitorKeys} from 'eslint-visitor-keys';
import {Node} from '../../types/ast';

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const KEYS = Evk.unionWith({
    XAttribute: ['key', 'value'],
    XDirective: ['key', 'value'],
    XDocument: ['children'],
    XElement: ['startTag', 'children', 'endTag'],
    XMustache: ['value'],
    XExpression: ['expression'],
    SwanForExpression: ['left', 'index', 'right', 'trackBy'],
    XStartTag: ['attributes'],
    XModule: ['body'],
});

/**
 * Check that the given key should be traversed or not.
 * @this {Traversable}
 * @param key The key to check.
 * @returns `true` if the key should be traversed.
 */
function fallbackKeysFilter(this: any, key: string): boolean {
    let value = null;
    return (
        key !== 'comments'
        && key !== 'leadingComments'
        && key !== 'loc'
        && key !== 'parent'
        && key !== 'range'
        && key !== 'tokens'
        && key !== 'trailingComments'
        && (value = this[key]) !== null
        && typeof value === 'object'
        && (typeof value.type === 'string' || Array.isArray(value))
    );
}

/**
 * Get the keys of the given node to traverse it.
 * @param node The node to get.
 * @returns The keys to traverse.
 */
function getFallbackKeys(node: Node): string[] {
    return Object.keys(node).filter(fallbackKeysFilter, node);
}

/**
 * Check wheather a given value is a node.
 * @param x The value to check.
 * @returns `true` if the value is a node.
 */
function isNode(x: any): x is Node {
    return x !== null && typeof x === 'object' && typeof x.type === 'string';
}

/**
 * Traverse the given node.
 * @param node The node to traverse.
 * @param parent The parent node.
 * @param visitor The node visitor.
 */
function traverse(node: Node, parent: Node | null, visitor: Visitor): void {
    let i = 0;
    let j = 0;

    visitor.enterNode(node, parent);

    const keys
        = (visitor.visitorKeys || KEYS)[node.type] || getFallbackKeys(node);
    for (i = 0; i < keys.length; ++i) {
        const child = (node as any)[keys[i]];

        if (Array.isArray(child)) {
            for (j = 0; j < child.length; ++j) {
                if (isNode(child[j])) {
                    traverse(child[j], node, visitor);
                }
            }
        }
        else if (isNode(child)) {
            traverse(child, node, visitor);
        }
    }

    visitor.leaveNode(node, parent);
}

//------------------------------------------------------------------------------
// Exports
//------------------------------------------------------------------------------

export interface Visitor {
    visitorKeys?: VisitorKeys;
    enterNode(node: Node, parent: Node | null): void;
    leaveNode(node: Node, parent: Node | null): void;
}

/**
 * Traverse the given AST tree.
 * @param node Root node to traverse.
 * @param visitor Visitor.
 */
export function traverseNodes(node: Node, visitor: Visitor): void {
    traverse(node, null, visitor);
}

export {getFallbackKeys};
