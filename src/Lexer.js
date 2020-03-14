const types = require('./Types');
const { Position } = require('vscode');
const { Token } = require('./Token');

const keywords = {
    'DEFUN': types.DEFUN,
    'QUOTE': types.QUOTE_FUNC,
    'LET': types.LET,
    'LET*': types.LET,
    'LOAD': types.LOAD,
    'IF': types.IF,
    'LOOP': types.LOOP,
    'IN-PACKAGE': types.IN_PACKAGE,
    'DEFPACKAGE': types.DEFPACKAGE,
    'FORMAT': types.FORMAT,
    'SETF': types.SETF,
    'HANDLER-CASE': types.HANDLER_CASE,
    'AND': types.AND,
    'T': types.TRUE,
    'NIL': types.NIL,
};

module.exports.Lexer = class {
    constructor(text) {
        this.text = text;
        this.line = 0;
        this.col = 0;
        this.curPos = 0;
        this.curText = undefined;
        this.start = undefined;
    }

    getTokens() {
        const tokens = [];

        while (true) {
            const token = this.nextToken();
            if (token === undefined) {
                break;
            }

            tokens.push(token);
        }

        return tokens;
    }

    nextToken() {
        this.start = new Position(this.line, this.col);
        this.curText = '';

        const char = this.peek();
        if (char === undefined) {
            return undefined;
        }

        if (this.isWS(char)) {
            return this.ws();
        }

        switch (char) {
            case '(':
                return this.char(types.OPEN_PARENS);
            case ')':
                return this.char(types.CLOSE_PARENS);
            case '\'':
                return this.char(types.SINGLE_QUOTE);
            case '`':
                return this.char(types.BACK_QUOTE);
            case '"':
                return this.quotedString();
            case '#':
                return this.pound();
            case '|':
                return this.bar();
            case ';':
                return this.comment();
            default:
                return this.id();
        }
    }

    comment() {
        this.curText += this.peek();
        this.consume();

        while (this.peek() !== undefined && this.peek() !== '\n') {
            this.curText += this.peek();
            this.consume();
        }

        return this.newToken(types.COMMENT);
    }

    bar() {
        this.consume();

        while (true) {
            if (this.peek() === undefined || this.peek() === '\n') {
                return this.newToken(types.MISMATCHED_BAR);
            }

            if (this.peek() === '\\') {
                this.curText += this.peek();
                this.consume();

                if (this.peek() === undefined) {
                    return this.newToken(types.MISMATCHED_BAR);
                }
                this.curText += this.peek();
                this.consume();
            } else if (this.peek() === '|') {
                this.consume();
                break;
            } else {
                this.curText += this.peek();
                this.consume();
            }
        }

        return this.newToken(types.ID);
    }

    pound() {
        this.consume();

        if (this.peek() === '|') {
            this.consume();
            return this.nestedComment();
        } else {
            this.curText += '#';
            return this.poundSequence();
        }
    }

    poundSequence() {
        while (!this.isDelimiter(this.peek())) {
            this.curText += this.peek();
            this.consume();
        }

        return this.newToken(types.POUND_SEQ);
    }

    nestedComment() {
        this.opens = 0;

        while (true) {
            if (this.peek() === undefined) {
                return this.newToken(types.MISMATCHED_COMMENT);
            }

            if (this.peek() === '|') {
                this.consume();

                if (this.peek() === '#') {
                    this.consume();
                    this.opens -= 1;

                    if (this.opens < 0) {
                        break;
                    } else {
                        this.curText += '|#';
                    }
                } else {
                    this.curText += '|';
                }
            } else if (this.peek() === '\\') {
                this.curText += this.peek();
                this.consume();

                if (this.peek() !== undefined) {
                    this.curText += this.peek();
                    this.consume();
                }
            } else if (this.peek() === '#') {
                this.curText += this.peek();
                this.consume();

                if (this.peek() === '|') {
                    this.opens += 1;

                    this.curText += this.peek();
                    this.consume();
                }
            } else {
                this.curText += this.peek();
                this.consume();
            }
        }

        return this.newToken(types.COMMENT);
    }

    quotedString() {
        this.curText += this.peek();
        this.consume();

        while (this.peek() !== '\"') {
            if (this.peek() === undefined) {
                return this.newToken(types.MISMATCHED_DBL_QUOTE);
            }

            if (this.peek() === '\\') {
                this.curText += this.peek();
                this.consume();
            }

            this.curText += this.peek();
            this.consume();
        }

        this.curText += this.peek();
        this.consume();

        return this.newToken(types.STRING);
    }

    id() {
        this.curText += this.peek();
        this.consume();

        while (!this.isDelimiter(this.peek())) {
            if (this.curText.length > 1 && this.curText.charAt(0) !== ':' && this.peek() === ':') {
                return this.newToken(types.PACKAGE_NAME);
            }

            this.curText += this.peek();
            this.consume();
        }

        if (this.curText.charAt(0) === ':') {
            return this.newToken(types.SYMBOL);
        }

        this.curText = this.curText.toUpperCase();
        const keywordID = keywords[this.curText];
        if (keywordID !== undefined) {
            return this.newToken(keywordID);
        }

        return this.newToken(types.ID);
    }

    char(type) {
        this.curText = this.peek();
        this.consume();

        return this.newToken(type);
    }

    ws() {
        this.curText += this.peek();
        this.consume();

        while (this.isWS(this.peek())) {
            this.curText += this.peek();
            this.consume();
        }

        return this.newToken(types.WHITE_SPACE);
    }

    isWS(char) {
        return (char !== undefined) && (char.trim() === '');
    }

    isParens(char) {
        return (char !== undefined) && ((char === '(') || (char === ')'));
    }

    isDelimiter(char) {
        return this.char === undefined || this.isWS(char) || this.isParens(char) || char === '"';
    }

    newToken(type) {
        return new Token(type, this.start, new Position(this.line, this.col), this.curText);
    }

    peek() {
        if (this.curPos >= this.text.length) {
            return undefined;
        }

        return this.text.charAt(this.curPos);
    }

    consume() {
        if (this.curPos >= this.text.length) {
            return;
        }

        if (this.peek() === '\n') {
            this.line += 1;
            this.col = 0;
        } else {
            this.col += 1;
        }

        this.curPos += 1;
    }
};
