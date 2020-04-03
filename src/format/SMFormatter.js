const types = require('../Types');
const { format } = require('util');
const { Position, Range, TextEdit, workspace } = require('vscode');

const DEFAULT_INDENT = 3;

module.exports.Formatter = class {
    constructor(doc, opts, tokens) {
        this.original = tokens;
        this.tokens = this.copyTokens(tokens);
        this.tokenNdx = undefined;
        this.sexprs = [];
        this.states = undefined;
        this.edits = undefined;
    }

    setConfiguration() {
        const cfg = workspace.getConfiguration('common_lisp');
        const haveCfg = (cfg !== undefined && cfg.format !== undefined);

        this.indentSize = (haveCfg && (cfg.format.indentWidth !== undefined)) ? cfg.format.indentWidth : DEFAULT_INDENT;
        this.alignExprs = (haveCfg && (cfg.format.alignExpressions !== undefined)) ? cfg.format.alignExpressions : false;
        this.indentCloseStack = (haveCfg && (cfg.format.indentCloseParenStack !== undefined)) ? cfg.format.indentCloseParenStack : true;
        this.closeParenStacked = (haveCfg && (cfg.format.closeParenStacked !== undefined)) ? cfg.format.closeParenStacked : undefined;
        this.removeBlankLines = (haveCfg && (cfg.format.removeBlankLines !== undefined)) ? cfg.format.removeBlankLines : undefined;
        this.fixWhitespace = (haveCfg && (cfg.format.fixWhitespace !== undefined)) ? cfg.format.fixWhitespace : undefined;
        this.allowOpenOnOwnLine = (haveCfg && (cfg.format.allowOpenOnOwnLine !== undefined)) ? cfg.format.allowOpenOnOwnLine : undefined;
    }

    copyTokens(tokens) {
        return tokens.map(token => JSON.parse(JSON.stringify(token)));
    }

    format() {
        this.setConfiguration();

        this.edits = [];
        this.tokenNdx = 0;

        while (true) {
            const token = this.peekToken();
            if (token === undefined) {
                break;
            }

            this.processToken(token);
            this.consume();
        }

        return this.edits;
    }

    processToken(token) {
        switch (token.type) {
            case types.OPEN_PARENS:
                return this.openParens(token);
            case types.CLOSE_PARENS:
                return this.closeParens(token);
            case types.WHITE_SPACE:
                return this.whitespace(token);
            case types.CONTROL:
            case types.ID:
            case types.KEYWORD:
            case types.MACRO:
            case types.SPECIAL:
            case types.SYMBOL:
                return this.funcCall(token);
            default:
                this.unhandledToken('processToken', token);
        }
    }

    funcCall(token) {
        if (this.sexprs.length === 0) {
            return;
        }

        const sexpr = this.sexprs[this.sexprs.length - 1];
        if (sexpr.indent === undefined) {
            sexpr.alignNext = true;
            sexpr.indent = this.alignIndent(sexpr, token);
            return;
        }

        if (sexpr.alignNext) {
            sexpr.indent = this.alignIndent(sexpr, token);
            sexpr.alignNext = false;
        }
    }

    alignIndent(sexpr, token) {
        return this.alignExprs ? token.start.character : sexpr.open.start.character + this.indentSize;
    }

    whitespace(token) {
        if (this.tokenNdx >= this.tokens.length - 1) {
            return this.fixEOF(token);
        }

        if (this.sexprs.length === 0) {
            console.log(`Whitespace outside expr ${format(token)}`);
            return;
        }

        const sexpr = this.sexprs[this.sexprs.length - 1];
        if (sexpr.indent === undefined && this.fixWhitespace) {
            return this.deleteToken();
        } else if (token.start.line === token.end.line) {
            if (this.fixWhitespace) {
                this.fixPadding(token);
            }
        } else if (this.tokens[this.tokenNdx + 1].type === types.CLOSE_PARENS) {
            this.fixIndent(token, sexpr.open.start.character);
        } else {
            this.fixIndent(token, sexpr.indent);
        }
    }

    fixPadding(token) {
        console.log(`FIX PADDING NOT DONE`);
    }

    deleteToken() {
        const origToken = this.original[this.tokenNdx];
        this.edits.push(TextEdit.delete(new Range(origToken.start, origToken.end)));

        let start = this.tokens[this.tokenNdx].start;
        let ndx = this.tokenNdx + 1;

        this.fixLine(start, ndx);
    }

    fixIndent(token, indent) {
        if (indent === undefined) {
            return;
        }

        let fixStart = undefined;
        const current = this.countIndent(token);
        if (current < indent) {
            const diff = indent - current;
            const pad = ' '.repeat(diff);

            this.edits.push(TextEdit.insert(new Position(token.end.line, token.end.character), pad));

            fixStart = new Position(token.end.line, token.end.character + diff);
        } else if (current > indent) {
            const diff = current - indent;
            const start = new Position(token.end.line, token.end.character - diff);
            const end = new Position(token.end.line, token.end.character);
            const range = new Range(start, end);

            this.edits.push(TextEdit.delete(range));
            fixStart = start;
        }

        if (fixStart !== undefined) {
            this.fixLine(fixStart, this.tokenNdx + 1);
        }
    }

    countIndent(token) {
        const txt = token.text;
        let count = 0;

        for (let ndx = txt.length - 1; ndx >= 0; ndx -= 1) {
            if (txt.charAt(ndx) === '\n') {
                break;
            }

            count += 1;
        }

        return count;
    }

    fixLine(start, ndx) {
        while (true) {
            if (ndx >= this.tokens.length) {
                break;
            }

            const next = this.tokens[ndx];

            next.start = start;
            if (next.end.line !== next.start.line) {
                break;
            }

            next.end = new Position(next.start.line, next.start.character + next.text.length);
            start = new Position(next.end.line, next.end.character);
            ndx += 1;
        }
    }

    fixEOF(token) {
        console.log(`EOF ${format(token)}`);
    }

    closeParens(token) {
        this.sexprs.pop();
    }

    openParens(token) {
        if (this.sexprs.length > 0) {
            const sexpr = this.sexprs[this.sexprs.length - 1];

            if (sexpr.indent === undefined || sexpr.alignNext) {
                sexpr.indent = this.alignIndent(sexpr, token);
                sexpr.alignNext = false;
            }
        }

        const expr = {
            open: token,
            alignNext: false,
            indent: undefined,
        };

        this.sexprs.push(expr);
    }

    unhandledToken(state, token) {
        console.log(`${state} unhandled token ${format(token)}`);
    }

    peekToken() {
        if (this.tokenNdx >= this.tokens.length) {
            return undefined;
        }

        return this.tokens[this.tokenNdx];
    }

    consume() {
        if (this.tokenNdx >= this.tokens.length) {
            return;
        }

        this.tokenNdx += 1;
    }
};
