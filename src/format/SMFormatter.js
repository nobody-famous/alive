const types = require('../Types');
const { format } = require('util');
const { Position, Range, TextEdit, workspace } = require('vscode');

const DEFAULT_INDENT = 3;

module.exports.Formatter = class {
    constructor(doc, opts, tokens) {
        this.original = tokens;
        this.tokens = this.copyTokens(tokens);
        this.token = undefined;
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
        this.curLine = 0;
        this.curLineEmpty = true;
        this.token = this.tokens[0];

        while (this.token !== undefined) {
            this.debugDump();
            this.processToken();
        }

        this.debugDump();
        return this.edits;
    }

    debugDump() {
        let str = '';
        let line = 0;

        for (let ndx = 0; ndx < this.tokens.length; ndx += 1) {
            const token = this.tokens[ndx];

            if (token.start.line !== line) {
                console.log(str);
                str = `[${token.start.line},${token.start.character}:${token.end.line},${token.end.character}]`;
                line = token.start.line;
            } else {
                str += `[${token.start.line},${token.start.character}:${token.end.line},${token.end.character}]`;
            }
        }
    }

    processToken() {
        if (this.token.start.line !== this.curLine) {
            this.curLine = this.token.start.line;
            this.curLineEmpty = true;
        }

        switch (this.token.type) {
            case types.OPEN_PARENS:
                this.curLineEmpty = false;
                return this.openParens();
            case types.CLOSE_PARENS:
                return this.closeParens();
            case types.WHITE_SPACE:
                return this.whitespace();
            case types.CONTROL:
            case types.ID:
            case types.KEYWORD:
            case types.MACRO:
            case types.SPECIAL:
            case types.SYMBOL:
                this.curLineEmpty = false;
                return this.funcCall();
            default:
                this.unhandledthis.token('processthis.token', this.token);
        }
    }

    funcCall() {
        if (this.sexprs.length === 0) {
            return;
        }

        const sexpr = this.sexprs[this.sexprs.length - 1];

        if (sexpr.open.start.line !== this.token.start.line) {
            for (let ndx = 0; ndx < this.sexprs.length; ndx += 1) {
                this.sexprs[ndx].multiline = true;
            }
        }

        if (sexpr.indent === undefined) {
            sexpr.alignNext = true;
            sexpr.indent = this.alignIndent(sexpr, this.token);
        } else if (sexpr.alignNext) {
            sexpr.indent = this.alignIndent(sexpr, this.token);
            sexpr.alignNext = false;
        }

        this.consume();
    }

    alignIndent(sexpr, token) {
        return this.alignExpressions ? token.start.character : sexpr.open.start.character + this.indentWidth;
    }

    whitespace() {
        console.log(`whitespace ${this.debugToken(this.token)}`);
        if (this.token.ndx >= this.tokens.length - 1) {
            return this.fixEOF();
        }

        if (this.sexprs.length === 0) {
            console.log(`Whitespace outside expr ${format(token)}`);
        } else if (this.tokens[this.token.ndx + 1].type === types.CLOSE_PARENS) {
            // Close parens code handles this
        } else {
            const sexpr = this.sexprs[this.sexprs.length - 1];
            if (sexpr.indent === undefined && this.fixWhitespace) {
                this.deleteToken(this.token);
            } else if (this.token.start.line === this.token.end.line) {
                this.fixPadding();
            } else {
                this.fixIndent(sexpr.indent);
            }
        }

        this.consume();
    }

    fixPadding() {
        console.log(`fixPadding ${this.debugToken(this.token)}`);
        if (!this.fixWhitespace || this.token.text.length <= 1) {
            return;
        }

        const origToken = this.original[this.token.ndx];
        const start = new Position(origToken.start.line, origToken.start.character + 1);
        const end = new Position(origToken.end.line, origToken.end.character);
        const range = new Range(start, end);

        this.edits.push(TextEdit.delete(range));
        console.log(`fixLine padding`);
        this.fixLine();
    }

    deleteToken(token) {
        const origToken = this.original[token.ndx];

        console.log(`delete ${this.debugToken(origToken)}, [${origToken.end.line},${origToken.end.character}]`);

        this.edits.push(TextEdit.delete(new Range(origToken.start, origToken.end)));

        let start = token.start;

        console.log(`fixLine delete`);
        this.fixLine(start, token.ndx + 1);
    }

    fixIndent(indent) {
        console.log(`fixIndent ${this.debugToken(this.token)}`);
        if (indent === undefined) {
            return;
        }

        const current = this.countIndent(this.token);
        const orig = this.original[this.token.ndx];

        if (current < indent) {
            const diff = indent - current;
            const pad = ' '.repeat(diff);

            this.edits.push(TextEdit.insert(new Position(orig.end.line, orig.end.character), pad));

            this.token.end = new Position(this.token.end.line, this.token.end.character + diff);
            this.fixLine();
        } else if (current > indent) {
            const diff = current - indent;
            const start = new Position(orig.end.line, orig.end.character - diff);
            const end = new Position(orig.end.line, orig.end.character);

            this.edits.push(TextEdit.delete(new Range(start, end)));

            this.token.end = new Position(this.token.end.line, this.token.end.character - diff);
            this.fixLine();
        }

        // let fixStart = undefined;
        // const current = this.countIndent(token);
        // if (current < indent) {
        //     const diff = indent - current;
        //     const pad = ' '.repeat(diff);

        //     this.edits.push(TextEdit.insert(new Position(token.end.line, token.end.character), pad));

        //     fixStart = new Position(token.end.line, token.end.character + diff);
        // } else if (current > indent) {
        //     const diff = current - indent;
        //     const start = new Position(token.end.line, token.end.character - diff);
        //     const end = new Position(token.end.line, token.end.character);
        //     const range = new Range(start, end);

        //     this.edits.push(TextEdit.delete(range));
        //     fixStart = start;
        // }

        // if (fixStart !== undefined) {
        //     console.log(`fixLine fixIndent`);
        //     this.fixLine(fixStart, this.tokenNdx + 1);
        // }
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

    fixLine() {
        console.log(`fixLine [${this.debugToken(this.token)}]`);

        let token = this.token;
        let next = this.nextToken(token);

        while (next !== undefined) {
            // if (next.start.line !== token.start.line) {
            //     break;
            // }

            if (next.start.character !== token.end.character) {
                next.start = new Position(next.start.line, token.end.character);
            }

            if (next.start.line !== next.end.line) {
                break;
            }

            next.end = new Position(next.start.line, next.start.character + next.text.length);

            token = next;
            next = this.nextToken(token);

            // console.log(`  ${next.start.line},${next.start.character} => ${start.line},${start.character}`);
            // next.start = new Position(start.line, start.character);

            // if (next.end.line !== next.start.line) {
            //     break;
            // }

            // next.end = new Position(start.line, start.character + next.text.length);

            // start = new Position(next.end.line, next.end.character);
            // ndx += 1;
        }
    }

    fixEOF() {
        console.log(`EOF ${this.token.start.line}, ${this.token.start.character}`);
        this.consume();
    }

    closeParens() {
        const sexpr = this.sexprs[this.sexprs.length - 1];
        console.log(`close parens ${this.debugToken(this.token)}`);

        const count = this.countCloseParens();

        if (this.closeParenOwnLine === 'multiline') {
            this.closeOwnLineMulti(sexpr, count);
            this.consume();
        } else {
            this.placeFirstCloseParen(sexpr, token, count);

            this.tokenNdx += 1;
            this.stackRemainingParens(count);

            // Have to put the last close parens back so main loop can consume it
            // this.tokenNdx -= 1;

            // if (this.closeParenStacked === 'always') {
            //     this.stackCloseParens(count);
            // } else if (this.closeParenStacked === 'never') {
            //     console.log('UNSTACK CLOSE PARENS');
            // } else {
            //     console.log('INDENT CLOSE PARENS');
            //     // this.fixIndent(prev, sexpr.open.start.character);
            //     // this.consumeCloseParens(count);
            // }
        }
    }

    stackRemainingParens(count) {
        if (count === 0) {
            return;
        }

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
            this.closeOwnLineNever(sexpr, token, count);
        } else if (prev.type === types.WHITE_SPACE) {
            this.closeParensWS(sexpr, prev);
        }
    }

    closeOwnLineMulti(sexpr, count) {
        console.log(`close multi ${sexpr.multiline} ${this.debugToken(this.token)}`);
        this.sexprs.pop();
        // while (true) {
        //     if (sexpr.multiline) {
        //         this.closeOwnLineAlways(sexpr, token, count);
        //         break;
        //     } else {
        //         this.closeOwnLineNever(sexpr, token, count);
        //     }

        //     if (count === 0) {
        //         return;
        //     }

        //     sexpr = this.sexprs[this.sexprs.length - 1];
        //     count -= 1;

        //     this.consumeCloseParens(1);
        //     token = this.tokens[this.tokenNdx];
        // }
    }

    closeOwnLineNever(sexpr, token, count) {
        const prev = this.prevToken(token);

        if (prev.type === types.WHITE_SPACE) {
            this.deleteToken(prev);
        }
    }

    closeOwnLineAlways(sexpr, token, count) {
        const prev = this.prevToken(token);
        const orig = this.original[prev.ndx];

        if (!this.curLineEmpty) {
            if (prev.type === types.WHITE_SPACE) {
                console.log(`ws adding nl ${this.debugToken(orig)}`);
                this.edits.push(TextEdit.insert(orig.start, '\n'));

                prev.start = new Position(prev.start.line + 1, 0);
                prev.end = new Position(prev.start.line + 1, prev.start.character + prev.text.length);

                this.adjustLineNumbers(prev.ndx + 1, 1);
            } else {
                console.log(`non-ws adding nl ${this.debugToken(orig)}, ${this.debugToken(token)}`);
                const pad = ' '.repeat(sexpr.open.start.character);
                this.edits.push(TextEdit.insert(orig.end, '\n' + pad));

                token.start = new Position(token.start.line + 1, sexpr.open.start.character);
                token.end = new Position(token.start.line + 1, sexpr.open.start.character + token.text.length);

                this.adjustLineNumbers(token.ndx + 1, 1);
                this.fixLine(token.start, token.ndx + 1);
            }
        } else {
            if (this.indentCloseParenStack) {
                this.fixIndent(orig, sexpr.open.start.character);
            } else {
                const topExpr = (count === 0) ? sexpr : this.sexprs[this.sexprs.length - count];
                this.fixIndent(orig, topExpr.open.start.character);
            }
        }
    }

    adjustLineNumbers(startNdx, diff) {
        for (let ndx = startNdx; ndx < this.tokens.length; ndx += 1) {
            const token = this.tokens[ndx];

            console.log(`adjust line ${token.start.line},${token.start.character} => ${token.start.line + diff},${token.start.character}`);
            this.tokens[ndx].start = new Position(token.start.line + diff, token.start.character);
            this.tokens[ndx].end = new Position(token.end.line + diff, token.end.character);
        }
    }

    closeParensWS(sexpr, ws) {
        if (ws.start.line === ws.end.line) {
            this.closeParensOneLineWS(sexpr, ws);
        } else {
            this.closeParensMulilineineWS(sexpr, ws);
        }
    }

    closeParensMulilineineWS(sexpr, ws) {
        this.fixIndent(ws, sexpr.open.start.character);
    }

    closeParensOneLineWS(sexpr, ws) {
        if (this.fixWhitespace) {
            this.deleteToken(ws);
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

        for (let ndx = this.token.ndx; ndx < this.tokens.length; ndx += 1) {
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

    openParens() {
        if (this.sexprs.length > 0) {
            const sexpr = this.sexprs[this.sexprs.length - 1];

            if (sexpr.indent === undefined || sexpr.alignNext) {
                sexpr.indent = this.alignIndent(sexpr, this.token);
                sexpr.alignNext = false;
            }
        }

        const expr = {
            open: this.token,
            alignNext: false,
            indent: undefined,
            multiline: false,
        };

        console.log(`push expr ${this.debugToken(this.original[this.token.ndx])} => ${this.debugToken(this.token)}`);
        this.sexprs.push(expr);

        this.consume();
    }

    unhandledToken(state, token) {
        console.log(`${state} unhandled token ${format(token)}`);
    }

    prevToken(token) {
        const ndx = token.ndx - 1;

        if (ndx < 0) {
            return undefined;
        }

        return this.tokens[ndx];
    }

    nextToken(token) {
        const ndx = token.ndx + 1;

        if (ndx >= this.tokens.length) {
            return undefined;
        }

        return this.tokens[ndx];
    }

    peekToken() {
        if (this.tokenNdx >= this.tokens.length) {
            return undefined;
        }

        return this.tokens[this.tokenNdx];
    }

    consume() {
        const next = (this.token.ndx + 1 < this.tokens.length)
            ? this.tokens[this.token.ndx + 1]
            : undefined;

        this.token = next;
    }

    debugToken(token) {
        return `[${token.start.line},${token.start.character}]`;
    }
};
