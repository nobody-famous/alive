const { Range } = require('vscode');
const types = require('../Types');

module.exports.AST = class {
    constructor() {
        this.nodes = [];
    }

    addNode(node) {
        this.nodes.push(node);
    }

    getPositionNode(pos) {
        for (let node of this.nodes) {
            const range = this.getNodeRange(node);

            if (this.isPosInRange(pos, range)) {
                return node;
            }
        }

        return undefined;
    }

    getNodeRange(node) {
        if (node.open !== undefined) {
            return new Range(node.open.start, node.close.start);
        }

        if (node.value !== undefined) {
            return new Range(node.value.start, node.value.end);
        }

        return undefined;
    }

    isPosInRange(pos, range) {
        if (range === undefined) {
            return false;
        }

        if (pos.line === range.start.line && pos.character < range.start.character) {
            return false;
        }

        if (pos.line === range.end.line && pos.character > range.end.character) {
            return false;
        }

        return (pos.line >= range.start.line && pos.line <= range.end.line);
    }

    debug() {
        for (let ndx = 0; ndx < this.nodes.length; ndx += 1) {
            const node = this.nodes[ndx];
            this.debugNode(node, '  ');
        }
    }

    debugNode(node, indent) {
        if (node.value !== undefined) {
            const str = node.value.type === types.WHITE_SPACE ? '' : node.value.text;
            console.log(`${indent}${str}`);
            return;
        }

        console.log(`${indent}(`);
        for (let ndx = 0; ndx < node.kids.length; ndx += 1) {
            const kid = node.kids[ndx];
            this.debugNode(kid, indent + '  ');
        }
        console.log(`${indent})`);
    }
};
