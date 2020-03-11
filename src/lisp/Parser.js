const types = require('../Types');
const { Lexer } = require('../Lexer');
const { AST } = require('./AST');
const { Node } = require('./Node');

module.exports.Parser = class {
    constructor(text) {
        this.lex = new Lexer(text);
        this.tokens = undefined;
        this.ndx = undefined;
        this.ast = undefined;
    }

    parse() {
        this.ndx = 0;
        this.tokens = this.lex.getTokens();
        this.ast = new AST();

        while (this.peek() !== undefined) {
            const node = this.expr();
            if (node !== undefined) {
                this.ast.addNode(node);
            }
        }

        this.ast.debug();
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
