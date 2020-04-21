const types = require('../Types');
const { format } = require('util');
const { AST } = require('./AST');
const { Node } = require('./Node');

module.exports.Parser = class {
    constructor(tokens) {
        this.tokens = tokens;
        this.ndx = undefined;
    }

    parse() {
        this.ndx = 0;
        const ast = new AST();

        while (this.peek() !== undefined) {
            const node = this.expr();
            if (node !== undefined) {
                if (node.open !== undefined && node.close === undefined) {
                    node.close = this.tokens[this.tokens.length - 1];
                }
                ast.addNode(node);
            }
        }

        return ast;
    }

    expr() {
        if (this.peek() === undefined) {
            return undefined;
        }

        const node = new Node();

        if (this.peek().type === types.OPEN_PARENS || this.peek().type === types.MISMATCHED_OPEN_PARENS) {
            this.sexpr(node);
        } else {
            node.value = this.peek();
            this.consume();
        }

        return node;
    }

    sexpr(node) {
        node.open = this.peek();
        this.consume();

        while (true) {
            if (this.peek() === undefined) {
                return;
            }

            if (this.peek().type === types.CLOSE_PARENS || this.peek().type === types.MISMATCHED_CLOSE_PARENS) {
                break;
            }

            const e = this.expr();
            node.kids.push(e);
        }

        node.close = this.peek();
        this.consume();
    }

    peek() {
        if (this.ndx === undefined || this.tokens === undefined || this.ndx >= this.tokens.length) {
            return undefined;
        }

        return this.tokens[this.ndx];
    }

    consume() {
        if (this.peek() === undefined) {
            return;
        }

        this.ndx += 1;
    }
};
