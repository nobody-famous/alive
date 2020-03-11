const types = require('../Types');
const { format } = require('util');
const { Lexer } = require('../Lexer');
const { Token } = require('../Token');
const { Position } = require('vscode');

module.exports.Parser = class {
    constructor(text) {
        this.lex = new Lexer(text);
        this.tokens = undefined;
        this.ndx = 0;
        this.parens = [];
    }

    parse() {
        let list = [];
        this.tokens = this.lex.getTokens();

        console.log(`tokens ${this.tokens.length}`);
        // while (this.peek() !== undefined) {
        this.expr();
        // }

        return list;
    }

    splitWS() {
        const token = this.peek();
        if (token.type !== types.WHITE_SPACE) {
            return [];
        }

        const lines = [];
        const text = token.text;
        let lineNum = token.start.line;
        let begin = 0;

        for (let ndx = 0; ndx < text.length; ndx += 1) {
            if (text.charAt(ndx) !== '\n') {
                continue;
            }

            const ws = text.substring(begin, ndx);
            const start = new Position(lineNum, 0);
            const end = new Position(lineNum, ws.length);

            lines.push(new Token(types.WHITE_SPACE, start, end, ws));

            begin = ndx + 1;
            lineNum += 1;
        }

        return lines;
    }

    expr() {
        let token = this.peek();
        const expr = {
            indent: undefined,
            kids: [],
        };

        if (token.type === types.WHITE_SPACE) {
            expr.indent = this.splitWS();

            this.consume();
            token = this.peek();
        }

        if (token === undefined) {
            return expr;
        }

        switch (token.type) {
            case types.OPEN_PARENS:
                return this.sexpr(expr);
            default:
                console.log(`UNHANDLED TOKEN ${token.type} ${token.text}`);
                this.consume();
        }

        return expr;
    }

    sexpr(expr) {
        this.parens.push(this.peek());
        this.consume();

        while (this.peek() !== undefined && this.peek().type !== types.CLOSE_PARENS) {
            if (this.peek().type === types.WHITE_SPACE) {
                expr.kids.push(this.peek());
                this.consume();
            } else if (this.peek().type === types.IN_PACKAGE) {
                this.inPackage(expr);
                console.log(`inPackage ${expr.kids.length}`);
                break;
            }
        }

        const close = this.peek();
        const open = this.parens.pop();
        close.match = open;
        open.match = close;

        this.consume();
    }

    inPackage(expr) {
        expr.kids.push(this.peek());
        this.consume();

        if (this.peek() === undefined) {
            return;
        }

        if (this.peek().type === types.WHITE_SPACE) {
            expr.kids.push(this.peek());
            this.consume();
        }

        if (this.peek() === undefined) {
            return;
        }

        if (this.peek().type === types.PACKAGE_NAME) {
            expr.kids.push(this.peek());
            this.consume();
        }

        while (this.peek() !== undefined && this.peek().type !== types.CLOSE_PARENS) {
            expr.kids.push(this.peek());
            this.consume();
        }
    }

    peek() {
        if (this.tokens === undefined || this.ndx >= this.tokens.length) {
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
