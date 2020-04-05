const types = require('../Types');
const { format } = require('util');
const { Position, Range, TextEdit, workspace } = require('vscode');

const DEFAULT_INDENT = 3;

module.exports.Formatter = class {
    constructor(doc, opts, tokens) {
        this.original = tokens;
        this.tokens = this.copyTokens(tokens);
        this.tokenNdx = undefined;
        this.curLine = undefined;
        this.curLineEmpty = undefined;
        this.sexprs = [];
        this.states = undefined;
        this.edits = undefined;
    }

    setConfiguration() {
        const cfg = workspace.getConfiguration('common_lisp');
        const haveCfg = (cfg !== undefined && cfg.format !== undefined);

        if (!haveCfg) {
            return;
        }

        this.setConfigOption(cfg, 'indentWidth', DEFAULT_INDENT);
        this.setConfigOption(cfg, 'alignExpressions', false);

        this.setConfigOption(cfg, 'allowOpenOnOwnLine', undefined);

        this.setConfigOption(cfg, 'indentCloseParenStack', true);
        this.setConfigOption(cfg, 'closeParenStacked', undefined);
        this.setConfigOption(cfg, 'closeParenOwnLine', undefined);

        this.setConfigOption(cfg, 'removeBlankLines', undefined);
        this.setConfigOption(cfg, 'fixWhitespace', undefined);
    }

    setConfigOption(cfg, opt, value = undefined) {
        this[opt] = cfg.format[opt] !== undefined ? cfg.format[opt] : value;
    }

    copyTokens(tokens) {
        const newTokens = [];

        for (let ndx = 0; ndx < tokens.length; ndx += 1) {
            const token = tokens[ndx];
            const copy = JSON.parse(JSON.stringify(token));

            copy.ndx = ndx;
            newTokens.push(copy);
        }

        return newTokens;
    }

    format() {
        this.setConfiguration();

        this.edits = [];
        this.tokenNdx = 0;
        this.curLine = 0;
        this.curLineEmpty = true;

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
        if (token.start.line !== this.curLine) {
            this.curLine = token.start.line;
            this.curLineEmpty = true;
        }

        switch (token.type) {
            case types.OPEN_PARENS:
                this.curLineEmpty = false;
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
                this.curLineEmpty = false;
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

        if (sexpr.open.start.line !== token.start.line) {
            sexpr.multiline = true;
        }

        if (sexpr.indent === undefined) {
            sexpr.alignNext = true;
            sexpr.indent = this.alignIndent(sexpr, token);
        } else if (sexpr.alignNext) {
            sexpr.indent = this.alignIndent(sexpr, token);
            sexpr.alignNext = false;
        }
    }

    alignIndent(sexpr, token) {
        return this.alignExpressions ? token.start.character : sexpr.open.start.character + this.indentWidth;
    }

    whitespace(token) {
        if (this.tokenNdx >= this.tokens.length - 1) {
            return this.fixEOF(token);
        }

        if (this.sexprs.length === 0) {
            console.log(`Whitespace outside expr ${format(token)}`);
            return;
        }

        if (this.tokens[this.tokenNdx + 1].type === types.CLOSE_PARENS) {
            // Close parens code handles this
            return;
        }

        const sexpr = this.sexprs[this.sexprs.length - 1];
        if (sexpr.indent === undefined && this.fixWhitespace) {
            this.deleteToken(this.tokenNdx);
        } else if (token.start.line === token.end.line) {
            this.fixPadding(token);
        } else {
            this.fixIndent(this.original[token.ndx], sexpr.indent);
        }
    }

    fixPadding(token) {
        if (!this.fixWhitespace || token.text.length <= 1) {
            return;
        }

        const origToken = this.original[this.tokenNdx];
        const start = new Position(origToken.start.line, origToken.start.character + 1);
        const end = new Position(origToken.end.line, origToken.end.character);
        const range = new Range(start, end);

        this.edits.push(TextEdit.delete(range));
        this.fixLine(token.start, this.tokenNdx + 1);
    }

    deleteToken(tokenNdx) {
        const origToken = this.original[tokenNdx];
        this.edits.push(TextEdit.delete(new Range(origToken.start, origToken.end)));

        let start = this.tokens[tokenNdx].start;
        let ndx = tokenNdx + 1;

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
        const txt = (token.text !== undefined) ? token.text : '';
        let count = 0;

        for (let ndx = txt.length - 1; ndx >= 0; ndx -= 1) {
            if (txt.charAt(ndx) !== ' ') {
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
        const sexpr = this.sexprs.pop();
        const count = this.countCloseParens() - 1;

        this.placeFirstCloseParen(sexpr, token, count);

        this.tokenNdx += 1;
        if (this.closeParenStacked === 'always') {
            this.stackCloseParens(count);
        } else if (this.closeParenStacked === 'never') {
            console.log('UNSTACK CLOSE PARENS');
        } else {
            console.log('INDENT CLOSE PARENS');
            // this.fixIndent(prev, sexpr.open.start.character);
            // this.consumeCloseParens(count);
        }
    }

    placeFirstCloseParen(sexpr, token, count) {
        if (this.prevToken(token) === undefined) {
            return;
        }

        if (this.closeParenOwnLine === 'always') {
            this.closeOwnLineAlways(sexpr, token, count);
        } else if (this.closeParenOwnLine === 'never') {

        } else if (this.closeParenOwnLine === 'multiline') {

        } else if (prev.type === types.WHITE_SPACE) {
            // this.closeParensWS(sexpr, prev);
        }
    }

    closeOwnLineAlways(sexpr, token, count) {
        const prev = this.prevToken(token);
        const orig = this.original[prev.ndx];

        if (!this.curLineEmpty) {
            if (prev.type === types.WHITE_SPACE) {
                this.edits.push(TextEdit.insert(orig.start, '\n'));
                prev.start = new Position(prev.start.line + 1, 0);
                prev.end = new Position(prev.start.line + 1, prev.start.character + prev.text.length);
            } else {
                this.edits.push(TextEdit.insert(orig.end, '\n'));
                token.start = new Position(token.start.line + 1, sexpr.open.start.character);
                token.end = new Position(token.start.line + 1, sexpr.open.start.character + token.text.length);
            }
        }

        if (this.indentCloseParenStack) {
            this.fixIndent(orig, sexpr.open.start.character);
        } else {
            const topExpr = (count === 0) ? sexpr : this.sexprs[this.sexprs.length - count];
            this.fixIndent(orig, topExpr.open.start.character);
        }
    }

    closeParensWS(sexpr, ws) {
        if (ws.start.line === ws.end.line) {
            this.closParensOneLineWS(sexpr, ws);
        } else {
            this.closParensMulilineineWS(sexpr, ws);
        }
    }

    closParensMulilineineWS(sexpr, ws) {
        this.fixIndent(ws, sexpr.open.start.character);
    }

    closParensOneLineWS(sexpr, ws) {
        if (this.fixWhitespace) {
            this.deleteToken(this.tokenNdx - 1);
        }
    }

    stackCloseParens(count) {
        while (count > 0) {
            const token = this.tokens[this.tokenNdx];

            if (token.type === types.CLOSE_PARENS) {
                this.sexprs.pop();
                count -= 1;
            } else if (token.type === types.WHITE_SPACE) {
                this.deleteToken(this.tokenNdx);
            }

            this.tokenNdx += 1;
        }

        // Have to put the last close parens back so main loop can consume it
        this.tokenNdx -= 1;
    }

    consumeCloseParens(count) {
        while (count > 0) {
            const token = this.tokens[this.tokenNdx];

            if (token.type === types.CLOSE_PARENS) {
                this.sexprs.pop();
                count -= 1;
            }

            this.tokenNdx += 1;
        }
    }

    countCloseParens() {
        let count = 0;

        for (let ndx = this.tokenNdx; ndx < this.tokens.length; ndx += 1) {
            const token = this.tokens[ndx];

            if (token.type === types.WHITE_SPACE) {
                continue;
            }

            if (token.type !== types.CLOSE_PARENS) {
                break;
            }

            count += 1;
        }

        return count;
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
            multiline: false,
        };

        this.sexprs.push(expr);
    }

    unhandledToken(state, token) {
        console.log(`${state} unhandled token ${format(token)}`);
    }

    prevToken(token) {
        if (token.ndx === 0) {
            return undefined;
        }

        return this.tokens[token.ndx - 1];
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
