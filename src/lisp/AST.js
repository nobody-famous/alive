const types = require('../Types');

module.exports.AST = class {
    constructor() {
        this.nodes = [];
        this.symbleTable = {};
    }

    addNode(node) {
        this.nodes.push(node);
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
