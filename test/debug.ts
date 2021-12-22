/**
 * @file test.ts
 * @author mengke01(kekee000@gmail.com)
 */
import {parse} from  '../src';


function travels(node: any) {
    delete node.parent;
    if (node.children) {
        node.children.forEach(travels);
    }
    if (node.attributes) {
        node.attributes.forEach(travels);
    }
    for (let key of Object.keys(node)) {
        if (node[key] && typeof node[key] === 'object') {
            delete node[key].parent;
        }
    }
}

const swanXml = 
`<view bindtap=" abc "></view>`

console.time('parse');
const ast = parse(swanXml, {
    noOpenTag: true,
    script: {
        parser: 'espree',
        range: true,
        loc: true,
        tokens: true,
    }
});
console.timeEnd('parse');

travels(ast);

console.log(JSON.stringify(ast, function (key, value) {
    if (key === 'parent') {
        return void 0;
    }
    return value;
}, 2));