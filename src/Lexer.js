const types = require('./Types');
const { Position } = require('vscode');
const { Token } = require('./Token');

const arrays = require('./keywords/arrays');
const control = require('./keywords/control');
const kwTypes = require('./keywords/types');
const iteration = require('./keywords/iteration');
const objects = require('./keywords/objects');
const structures = require('./keywords/structures');
const conditions = require('./keywords/conditions');
const symbols = require('./keywords/symbols');
const packages = require('./keywords/packages');
const numbers = require('./keywords/numbers');
const characters = require('./keywords/characters');
const conses = require('./keywords/conses');
const strings = require('./keywords/strings');
const sequences = require('./keywords/sequences');
const hashtables = require('./keywords/hashtables');
const filenames = require('./keywords/filenames');
const files = require('./keywords/files');
const streams = require('./keywords/streams');
const printer = require('./keywords/printer');
const reader = require('./keywords/reader');
const sysconstruct = require('./keywords/sysconstruct');
const env = require('./keywords/env');

const keywords = {};

arrays.forEach(item => addKeyword(item, types.KEYWORD));
control.forEach(item => addKeyword(item, types.CONTROL));
kwTypes.forEach(item => addKeyword(item, types.KEYWORD));
iteration.forEach(item => addKeyword(item, types.KEYWORD));
objects.forEach(item => addKeyword(item, types.KEYWORD));
structures.forEach(item => addKeyword(item, types.KEYWORD));
conditions.forEach(item => addKeyword(item, types.KEYWORD));
symbols.forEach(item => addKeyword(item, types.KEYWORD));
packages.forEach(item => addKeyword(item, types.PACKAGES));
numbers.forEach(item => addKeyword(item, types.KEYWORD));
characters.forEach(item => addKeyword(item, types.KEYWORD));
conses.forEach(item => addKeyword(item, types.KEYWORD));
strings.forEach(item => addKeyword(item, types.KEYWORD));
sequences.forEach(item => addKeyword(item, types.KEYWORD));
hashtables.forEach(item => addKeyword(item, types.KEYWORD));
filenames.forEach(item => addKeyword(item, types.KEYWORD));
files.forEach(item => addKeyword(item, types.KEYWORD));
streams.forEach(item => addKeyword(item, types.KEYWORD));
printer.forEach(item => addKeyword(item, types.KEYWORD));
reader.forEach(item => addKeyword(item, types.KEYWORD));
sysconstruct.forEach(item => addKeyword(item, types.KEYWORD));
env.forEach(item => addKeyword(item, types.KEYWORD));

function addKeyword(item, wordType) {
    const label = item.label.toUpperCase();

    if (item.type === 'Function' || item.type === 'Local Function' || item.type === 'Accessor') {
        keywords[label] = wordType;
    } else if (item.type === 'Macro' || item.type === 'Local Macro') {
        keywords[label] = types.MACRO;
    } else if (item.type === 'Special Operator') {
        keywords[label] = types.SPECIAL;
    } else {
        keywords[label] = types.KEYWORD;
    }
}

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

        return this.newToken(types.ID, true);
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
        if (this.peek() === '\\') {
            this.curText += this.peek();
            this.consume();

            this.curText += this.peek();
            this.consume();
            return this.newToken(types.POUND_SEQ);
        }

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
                return this.newToken(types.PACKAGE_NAME, true);
            }

            this.curText += this.peek();
            this.consume();
        }

        if (this.curText.charAt(0) === ':') {
            return this.newToken(types.SYMBOL, true);
        }

        this.curText = this.curText.toUpperCase();
        const keywordID = keywords[this.curText];
        if (keywordID !== undefined) {
            return this.newToken(keywordID, true);
        }

        return this.newToken(types.ID, true);
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
        return char === undefined || this.isWS(char) || this.isParens(char) || char === '"';
    }

    newToken(type, upcase = false) {
        const text = upcase ? this.curText.toUpperCase() : this.curText;
        return new Token(type, this.start, new Position(this.line, this.col), text);
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
