const types = require('../Types');
const { Lexer } = require('../Lexer');

module.exports.Parser = class {
    constructor(text) {
        this.lex = new Lexer(text);
        this.curNdx = undefined;
        this.tokens = undefined;
        this.parens = [];
        this.unclosedString = undefined;
    }

    parse() {
        this.tokens = this.lex.getTokens();
        this.curNdx = 0;

        while (true) {
            this.skipWS();
            if (this.peek() === undefined) {
                break;
            }

            this.expr();
        }

        return this.tokens;
    }

    expr() {
        const token = this.peek();
        if (token === undefined) {
            return;
        }

        if (token.type === types.OPEN_PARENS) {
            this.sexpr();
        } else if (token.type === types.CLOSE_PARENS) {
            token.type = types.MISMATCHED_CLOSE_PARENS;
            this.consume();
        } else if (token.type === types.SINGLE_QUOTE || token.type === types.BACK_QUOTE) {
            this.quote();
        } else {
            this.consume();
        }
    }

    quote() {
        this.consumeNoSkip();
        if (this.peek() === undefined || this.peek().type === types.WHITE_SPACE) {
            return;
        }

        const start = this.curNdx;
        this.expr();
        this.quoteItems(start, this.curNdx);
    }

    quoteItems(start, end) {
        for (let ndx = start; ndx < end; ndx += 1) {
            const token = this.tokens[ndx];
            if (token.type !== types.WHITE_SPACE) {
                token.type = types.QUOTED;
            }
        }
    }

    sexpr() {
        this.parens.push(this.peek());
        this.consume();

        if (this.peek() === undefined) {
            return;
        }

        this.sexprCheckFunctionCall();

        while (true) {
            if (this.peek() === undefined) {
                const token = this.parens.pop();
                token.type = types.MISMATCHED_OPEN_PARENS;
                break;
            }

            if (this.peek().type === types.CLOSE_PARENS) {
                this.parens.pop();
                this.consume();
                break;
            }

            if (this.peek().type === types.DEFUN) {
                this.defun();
            } else if (this.peek().type === types.QUOTE_FUNC) {
                this.quoteFn();
            } else if (this.peek().type === types.IN_PACKAGE) {
                this.inPackage();
            } else if (this.peek().type === types.DEFPACKAGE) {
                this.defPackage();
            } else {
                this.expr();
            }
        }
    }

    quoteFn() {
        this.consume();

        const start = this.curNdx;
        this.expr();
        this.quoteItems(start, this.curNdx);
    }

    sexprCheckFunctionCall() {
        if (this.peek().type === types.ID) {
            this.peek().type = types.FUNCTION;
            this.consume();
        } else if (this.peek().type === types.PACKAGE_NAME) {
            this.consume();
            if (this.peek() === undefined) {
                return;
            }

            if (this.peek().type === types.SYMBOL) {
                this.peek().type = types.FUNCTION;
                this.consume();
            }
        }
    }

    load() {
        this.consume();
        while (this.peek() !== undefined && this.peek().type !== types.CLOSE_PARENS) {
            this.consume();
        }
    }

    defPackage() {
        this.consume();
        this.skipWS();

        let token = this.peek();
        if (token.type !== types.SYMBOL) {
            return;
        }

        this.consume();
        token.type = types.PACKAGE_NAME;

        while (this.peek() !== undefined && this.peek().type !== types.CLOSE_PARENS) {
            this.expr();
        }
    }

    inPackage() {
        this.consume();
        this.skipWS();

        let token = this.peek();
        if (token.type !== types.SYMBOL) {
            return;
        }
        this.consume();

        token.type = types.PACKAGE_NAME;
    }

    defun() {
        this.consume();

        let token = this.peek();
        if (token.type !== types.ID) {
            return;
        }

        token.type = types.FUNCTION;
        this.consume();

        token = this.peek();
        if (token === undefined || token.type !== types.OPEN_PARENS) {
            return;
        }

        this.parens.push(token);
        this.consume();

        this.paramList();

        if (this.peek() === undefined) {
            return;
        }

        while (this.peek() !== undefined && this.peek().type !== types.CLOSE_PARENS) {
            this.expr();
        }
    }

    paramList() {
        while (true) {
            if (this.peek() === undefined) {
                const parens = this.parens.pop();
                parens.type = types.MISMATCHED_OPEN_PARENS;
                return;
            }

            if (this.peek().type === types.CLOSE_PARENS) {
                this.parens.pop();
                this.consume();
                break;
            }

            this.peek().type = types.PARAMETER;
            this.consume();
        }
    }

    skipWS() {
        while (this.peek() !== undefined && this.peek().type === types.WHITE_SPACE) {
            this.consume();
        }
    }

    peek() {
        if (this.curNdx >= this.tokens.length) {
            return undefined;
        }

        const token = this.tokens[this.curNdx];
        if (this.unclosedString === undefined && token.type === types.MISMATCHED_DBL_QUOTE) {
            this.unclosedString = token;
        }

        return token;
    }

    consumeNoSkip() {
        if (this.curNdx >= this.tokens.length) {
            return;
        }

        this.curNdx += 1;
    }

    consume() {
        this.consumeNoSkip();
        this.skipWS();
    }
};
