/**
 * @file util.ts
 * @author mengke(kekee000@gmail.com)
 */

const fs = require('fs');

exports.fixturesDir = `${__dirname}/../fixtures`;

exports.readXmlFile = (filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
        filePath,
        content
    };
};

exports.walkNode = (node, handler) => {
    delete node.parent;
    delete (node).tokens;

    handler(node);

    if (node.type === 'XElement') {
        walkNode(node.startTag, handler);
        for (const n of node.children) {
            walkNode(n, handler);
        }
        node.endTag && walkNode(node.endTag, handler);
    }
    else if (node.type === 'XDocument') {
        for (const n of node.children) {
            walkNode(n, handler);
        }
    }
    else if (node.type === 'XStartTag') {
        for (const n of node.attributes) {
            walkNode(n, handler);
        }
    }
    else if (node.type === 'XAttribute') {
        if (node.directive) {
            walkNode(node.key, handler);
        }
        if (node.value) {
            for (const n of node.value) {
                walkNode(n, handler);
            }
        }
    }
    else if (node.type === 'XDirectiveKey') {
        walkNode(node.name, handler);
    }
};
