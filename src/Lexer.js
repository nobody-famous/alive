const types = require('./Types');
const { Position } = require('vscode');
const { Token } = require('./Token');

module.exports.Lexer = class {
    constructor(text) {
        this.text = text;
        this.line = 0;
        this.col = 0;
        this.curPos = 0;
        this.curText = undefined;
        this.start = undefined;
        this.unmatchedOpenParens = [];
        this.unmatchedCloseParens = [];
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

        if (this.unmatchedOpenParens.length > 0) {
            this.unmatchedOpenParens.forEach(token => token.type = types.MISMATCHED_OPEN_PARENS);
        }

        if (this.unmatchedCloseParens.length > 0) {
            this.unmatchedCloseParens.forEach(token => token.type = types.MISMATCHED_CLOSE_PARENS);
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
                return this.openParens();
            case ')':
                return this.closeParens();
            default:
                return this.id();
        }
    }

    openParens() {
        const token = this.char(types.OPEN_PARENS);
        this.unmatchedOpenParens.push(token);
        return token;
    }

    closeParens() {
        const token = this.char(types.CLOSE_PARENS);

        if (this.unmatchedOpenParens.length > 0) {
            this.unmatchedOpenParens.pop();
        } else {
            this.unmatchedCloseParens.push(token);
        }

        return token;
    }

    id() {
        this.curText += this.peek();
        this.consume();

        while (!this.isDelimiter(this.peek())) {
            this.curText += this.peek();
            this.consume();
        }

        return this.newToken(types.ID);
    }

    char(type) {
        this.curText = this.peek();
        this.consume();

        return this.newToken(type);
    }

    ws() {
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
        return this.char === undefined || this.isWS(char) || this.isParens(char);
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
