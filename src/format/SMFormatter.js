const types = require('../Types');
const { Token } = require('../Token');
const { format } = require('util');
const { Position, Range, TextEdit, workspace } = require('vscode');

const DEFAULT_INDENT = 3;

module.exports.Formatter = class {
    constructor(doc, opts, ast) {
        this.ast = ast;
        this.parens = [];
        this.elems = [];
        this.lines = undefined;
        this.lineNdx = 0;

        // this.indentMap = {
        //     'DEFUN': (edits) => this.fixDefaultIndent(edits),
        //     'DEFPACKAGE': (edits) => this.fixDefaultIndent(edits),
        //     'LET': (edits) => this.fixDefaultIndent(edits),
        //     'LET*': (edits) => this.fixDefaultIndent(edits),
        //     'LOOP': (edits) => this.fixDefaultIndent(edits),
        //     'HANDLER-CASE': (edits) => this.fixDefaultIndent(edits),

        //     'AND': (edits) => this.fixAlignFirstElem(edits),
        //     'WHEN': (edits) => this.fixAlignFirstElem(edits),
        //     'IF': (edits) => this.fixAlignFirstElem(edits),
        // };
    }

    setConfiguration() {
        const cfg = workspace.getConfiguration('common_lisp');
        const haveCfg = (cfg !== undefined && cfg.format !== undefined);

        this.indentSize = (haveCfg && (cfg.format.indentWidth !== undefined)) ? cfg.format.indentWidth : DEFAULT_INDENT;
        this.indentCloseStack = (haveCfg && (cfg.format.indentCloseParenStack !== undefined)) ? cfg.format.indentCloseParenStack : true;
        this.closeParenStacked = (haveCfg && (cfg.format.closeParenStacked !== undefined)) ? cfg.format.closeParenStacked : undefined;
    }

    format() {
        this.setConfiguration();

        this.lines = [];
        this.lines.push([]);
        for (let ndx = 0; ndx < this.ast.nodes.length; ndx += 1) {
            this.createLines(this.lines, this.ast.nodes[ndx]);
        }

        const edits = this.formatLines();

        return edits;
    }

    formatLines() {
        const edits = [];

        while (this.lineNdx < this.lines.length) {
            if (this.isBlankLine(this.lines[this.lineNdx])) {
                this.fixBlankLine(edits, this.lines[this.lineNdx]);
            } else {
                this.indent(edits);
            }

            this.lineNdx += 1;
        }

        return edits;
    }

    fixBlankLine(edits, line) {
        if (line[0].text.length === 0) {
            return;
        }

        const token = line[0];
        const range = new Range(token.start, token.end);

        edits.push(TextEdit.delete(range));
    }

    indent(edits) {
        const line = this.lines[this.lineNdx];

        if (this.parens.length === 0) {
            this.fixIndent(edits, line, 0);
        } else if (line.length > 1 && line[1].text === ')') {
            this.fixCloseParen(edits);
        } else {
            this.fixChildElem(edits);
        }

        this.checkForParens(line);
    }

    checkForParens(line) {
        for (let ndx = 0; ndx < line.length; ndx += 1) {
            const token = line[ndx];

            if (token.text === '(') {
                this.elems.push(this.getNextElem(line, ndx + 1));
                this.parens.push(token);
            } else if (token.text === ')') {
                this.elems.pop();
                this.parens.pop();
            }
        }
    }

    getNextElem(line, ndx) {
        if (ndx >= line.length) {
            return undefined;
        }

        if (line[ndx].type === types.WHITE_SPACE) {
            if (ndx + 1 >= line.length) {
                return undefined;
            } else {
                ndx += 1;
            }
        }

        return line[ndx];
    }

    fixChildElem(edits) {
        if (this.elems.length === 0) {
            return;
        }

        const token = this.elems[this.elems.length - 1];
        const fn = this.indentMap[token.text];
        if (fn !== undefined) {
            return fn(edits);
        }

        switch (token.type) {
            case types.SYMBOL:
                return this.fixSymbolElem(edits);
            case types.ID:
            case types.KEYWORD:
                return this.fixAlignFirstElem(edits);
            case types.OPEN_PARENS:
                return this.fixAlignParent(edits);
            default:
                console.log(`fixChildElem in ${token.type} ${token.text}, line ${this.lineNdx}`);
        }
    }

    fixSymbolElem(edits) {
        const prevNdx = Math.max(0, this.elems.length - 2);
        const prevElem = this.elems[prevNdx];

        if (prevElem.text === 'DEFPACKAGE') {
            return this.fixAlignFirstElem(edits);
        }

        console.log(`fixSymbolElem ${prevElem.text}`);
    }

    fixDefaultIndent(edits) {
        const parent = this.parens[this.parens.length - 1];
        const indent = parent.start.character + this.indentSize;

        this.fixIndent(edits, this.lines[this.lineNdx], indent);
    }

    fixAlignParent(edits) {
        const indent = this.getElemIndent(this.elems, 1, 0);
        this.fixIndent(edits, this.lines[this.lineNdx], indent);
    }

    fixAlignFirstElem(edits) {
        const indent = this.getElemIndent(this.elems, 1, 1);
        this.fixIndent(edits, this.lines[this.lineNdx], indent);
    }

    getElemIndent(stack, stackNdx = 1, alignNdx = 0) {
        const parent = stack[stack.length - stackNdx];
        const parentLine = this.lines[parent.start.line];
        const parentNdx = this.getElemNdx(parentLine, parent);
        let align = parentNdx + alignNdx;

        if (align < parentLine.length && parentLine[align].type === types.WHITE_SPACE) {
            align += 1;
        }

        return (align < parentLine.length)
            ? parentLine[align].start.character
            : parent.start.character + this.indentSize;
    }

    getElemNdx(line, elem) {
        for (let ndx = 0; ndx < line.length; ndx += 1) {
            if (line[ndx] === elem) {
                return ndx;
            }
        }

        return undefined;
    }

    fixCloseParen(edits) {
        const line = this.lines[this.lineNdx];
        const open = this.parens[this.parens.length - 1];
        const stacked = this.countParenStack(line);

        this.fixCloseParenStack(edits);

        if ((stacked === this.parens.length) && !this.indentCloseStack) {
            this.fixIndent(edits, line, 0);
        } else {
            this.fixIndent(edits, line, open.start.character);
        }
    }

    fixCloseParenStack(edits) {
        if (this.closeParenStacked === 'always') {
            this.stackCloseParens(edits);
        } else if (this.closeParenStacked === 'never') {
            this.unstackCloseParens(edits);
        }
    }

    stackCloseParens(edits) {
        let startLine = this.lines[this.lineNdx];
        this.lineNdx += 1;

        while (true) {
            if (this.lineNdx >= this.lines.length) {
                break;
            }

            if (this.isBlankLine(this.lines[this.lineNdx])) {
                this.fixBlankLine(edits, this.lines[this.lineNdx]);
                this.lineNdx += 1;
                continue;
            }

            if (!this.startsWithClose(this.lines[this.lineNdx])) {
                this.lineNdx -= 1;
                break;
            }

            this.doStackParens(edits, startLine, this.lines[this.lineNdx]);
            this.checkForParens(this.lines[this.lineNdx]);

            if (!this.isParenStack(this.lines[this.lineNdx])) {
                this.splitAfterCloseParens(edits, this.lines[this.lineNdx]);
                break;
            }

            startLine = this.lines[this.lineNdx];
            this.lineNdx += 1;
        }
    }

    splitAfterCloseParens(edits, line) {
        let lastWS = undefined;

        for (let token of line) {
            if (token.type === types.WHITE_SPACE) {
                lastWS = token;
                continue;
            }

            if (token.text !== ')') {
                const start = (lastWS !== undefined) ? lastWS.start : token.start;
                edits.push(TextEdit.insert(start, '\n'));
                return;
            }

            lastWS = undefined;
        }
    }

    doStackParens(edits, startLine, endLine) {
        const start = startLine[startLine.length - 1].start;
        const end = endLine[1].start;

        edits.push(TextEdit.delete(new Range(start, end)));
    }

    startsWithClose(line) {
        if (line[0].text === ')') {
            return true;
        }

        if (line.length < 2) {
            return false;
        }

        return line[1].text === ')';
    }

    findLastClose(line) {
        let last = undefined;

        for (let ndx = 0; ndx < line.length; ndx += 1) {
            if (line[ndx].text === ')') {
                last = ndx;
            } else if (line[ndx].type !== types.WHITE_SPACE) {
                return undefined;
            }
        }

        return last;
    }

    unstackCloseParens(edits) {
        const stacked = this.countParenStack(this.lines[this.lineNdx]);
        if (stacked < 2) {
            return;
        }

        const line = this.lines[this.lineNdx];
        let newLine = this.lineNdx;
        let stackNdx = 1;
        for (let ndx = 0; ndx < line.length; ndx += 1) {
            if (line[ndx].text !== ')') {
                continue;
            }

            if (line[ndx].start.line === newLine) {
                newLine += 1;
                continue;
            }

            const indent = this.getElemIndent(this.parens, stackNdx, 0);
            edits.push(TextEdit.insert(new Position(line[ndx].start.line, line[ndx].start.character - 1), ' '.repeat(indent)));
            edits.push(TextEdit.insert(new Position(line[ndx].start.line, line[ndx].start.character), '\n'));

            stackNdx += 1;
        }
    }

    updateLineNumbers(startNdx) {
        for (let ndx = startNdx; ndx < this.lines.length; ndx += 1) {
            const line = this.lines[ndx];
            line.forEach(expr => {
                const diff = Math.abs(ndx - expr.start.line);
                expr.start = new Position(ndx, expr.start.character);
                expr.end = new Position(expr.end.line + diff, expr.end.character);
            });
        }
    }

    isParenStack(line) {
        for (let token of line) {
            if (token.type !== types.WHITE_SPACE && token.text !== ')') {
                return false;
            }
        }

        return true;
    }

    countParenStack(line) {
        let count = 0;

        for (let token of line) {
            if (token.text === ')') {
                count += 1;
            } else if (token.type !== types.WHITE_SPACE) {
                break;
            }
        }

        return count;
    }

    fixIndent(edits, line, target) {
        const token = line[0];

        if (token.type !== types.WHITE_SPACE) {
            return;
        }

        if (token.text.length > target) {
            const end = new Position(token.start.line, token.end.character - target);
            edits.push(TextEdit.delete(new Range(token.start, end)));
        } else if (token.text.length < target) {
            const diff = target - token.text.length;
            edits.push(TextEdit.insert(new Position(token.start.line, 0), ' '.repeat(diff)));
        }

        this.fixLineStarts(line, target);
    }

    fixLineStarts(line, target) {
        let char = target;
        const lineNum = line[0].start.line;

        for (let ndx = 1; ndx < line.length; ndx += 1) {
            line[ndx].start = new Position(lineNum, char);
            char += line[ndx].text.length;
        }
    }

    isBlankLine(line) {
        return line.length === 1 && line[0].type === types.WHITE_SPACE;
    }

    createLines(lines, node) {
        if (node.value !== undefined) {
            if (node.value.type === types.WHITE_SPACE) {
                this.splitLines(lines, types.WHITE_SPACE, node.value);
            } else if (node.value.type === types.COMMENT) {
                this.splitLines(lines, types.COMMENT, node.value);
            } else {
                lines[lines.length - 1].push(node.value);
            }
        } else {
            this.createObjectLines(lines, node);
        }
    }

    createObjectLines(lines, node) {
        const startLine = node.open.start.line;

        let token = new Token(node.open.type, node.open.start, node.open.end, '(');
        lines[lines.length - 1].push(token);

        for (let ndx = 0; ndx < node.kids.length; ndx += 1) {
            this.createLines(lines, node.kids[ndx]);
        }

        token = new Token(node.close.type, node.close.start, node.close.end, ')');
        lines[lines.length - 1].push(token);
    }

    splitLines(lines, type, token) {
        const splits = token.text.split('\n');
        const startLine = token.start.line;

        let startChar = token.start.character;
        for (let ndx = 0; ndx < splits.length; ndx += 1) {
            const curLine = startLine + ndx;
            if (ndx > 0) {
                startChar = 0;
            }

            const start = new Position(curLine, startChar);
            const end = new Position(curLine, startChar + splits[ndx].length);
            const newToken = new Token(type, start, end, splits[ndx]);

            startChar += splits[ndx].length;
            if (curLine !== startLine) {
                lines.push([newToken]);
            } else {
                lines[lines.length - 1].push(newToken);
            }
        }
    }
};
