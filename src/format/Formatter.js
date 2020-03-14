const types = require('../Types');
const { Token } = require('../Token');
const { format } = require('util');
const { State } = require('./State');
const { Position, Range, TextEdit, workspace } = require('vscode');

const DEFAULT_INDENT = 3;
module.exports.Formatter = class {
    constructor(doc, opts, ast) {
        this.ast = ast;
        this.parens = [];
        this.elems = [];
    }

    setConfiguration() {
        const cfg = workspace.getConfiguration('common_lisp');
        const haveCfg = (cfg !== undefined && cfg.format !== undefined);

        this.indentSize = (haveCfg && (cfg.format.indentWidth !== undefined)) ? cfg.format.indentWidth : DEFAULT_INDENT;
        this.indentCloseStack = (haveCfg && (cfg.format.indentCloseParenStack !== undefined)) ? cfg.format.indentCloseParenStack : true;
    }

    format() {
        this.setConfiguration();

        const lines = [];
        lines.push([]);
        for (let ndx = 0; ndx < this.ast.nodes.length; ndx += 1) {
            this.createLines(lines, this.ast.nodes[ndx]);
        }

        const edits = this.formatLines(lines);

        return edits;
    }

    formatLines(lines) {
        const edits = [];

        for (let ndx = 0; ndx < lines.length; ndx += 1) {
            if (this.fixBlankLine(lines[ndx])) {
                const token = lines[ndx][0];
                const range = new Range(token.start, token.end);

                edits.push(TextEdit.delete(range));
            } else {
                this.indent(edits, lines, ndx);
            }
        }

        return edits;
    }

    indent(edits, lines, lineNdx) {
        const line = lines[lineNdx];

        if (this.parens.length === 0) {
            this.fixIndent(edits, line, 0);
        } else if (line.length > 1 && line[1].text === ')') {
            this.fixCloseParen(edits, lines, lineNdx);
        } else {
            this.fixChildElem(edits, lines, lineNdx);
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

    fixChildElem(edits, lines, lineNdx) {
        if (this.elems.length === 0) {
            return;
        }

        const token = this.elems[this.elems.length - 1];
        switch (token.type) {
            case types.SYMBOL:
                return this.fixSymbolElem(edits, lines, lineNdx);
            case types.DEFUN:
            case types.DEFPACKAGE:
            case types.LET:
            case types.LOOP:
            case types.HANDLER_CASE:
                return this.fixDefaultIndent(edits, lines, lineNdx);
            case types.AND:
            case types.ID:
            case types.IF:
                return this.fixAlignFirstElem(edits, lines, lineNdx);
            case types.OPEN_PARENS:
                return this.fixAlignParent(edits, lines, lineNdx);
            default:
                console.log(`fixChildElem in ${token.type} ${token.text}, line ${lineNdx}`);
        }
    }

    fixSymbolElem(edits, lines, lineNdx) {
        const line = lines[lineNdx];
        const prevNdx = Math.max(0, this.elems.length - 2);
        const prevElem = this.elems[prevNdx];

        switch (prevElem.type) {
            case types.DEFPACKAGE:
                return this.fixAlignFirstElem(edits, lines, lineNdx);
            default:
                console.log(`fixSymbolElem ${prevElem.text}`);
        }
    }

    fixDefaultIndent(edits, lines, lineNdx) {
        const parent = this.parens[this.parens.length - 1];
        const indent = parent.start.character + this.indentSize;

        this.fixIndent(edits, lines[lineNdx], indent);
    }

    fixAlignParent(edits, lines, lineNdx) {
        const parent = this.elems[this.elems.length - 1];
        const parentLine = lines[parent.start.line];
        const parentNdx = this.getElemNdx(parentLine, parent);
        const indent = parentLine[parentNdx].start.character;

        this.fixIndent(edits, lines[lineNdx], indent);
    }

    fixAlignFirstElem(edits, lines, lineNdx) {
        const parent = this.elems[this.elems.length - 1];
        const parentLine = lines[parent.start.line];
        const parentNdx = this.getElemNdx(parentLine, parent);
        let alignNdx = parentNdx + 1;
        let indent = parent.start.character + this.indentSize;

        if (alignNdx < parentLine.length && parentLine[alignNdx].type === types.WHITE_SPACE) {
            alignNdx += 1;
        }

        if (alignNdx < parentLine.length) {
            indent = parentLine[alignNdx].start.character;
        }

        this.fixIndent(edits, lines[lineNdx], indent);
    }

    getElemNdx(line, elem) {
        for (let ndx = 0; ndx < line.length; ndx += 1) {
            if (line[ndx] === elem) {
                return ndx;
            }
        }

        return undefined;
    }

    fixCloseParen(edits, lines, lineNdx) {
        const line = lines[lineNdx];
        const open = this.parens[this.parens.length - 1];
        const stacked = this.countParenStack(line);

        if ((stacked === this.parens.length) && !this.indentCloseStack) {
            this.fixIndent(edits, line, 0);
        } else {
            this.fixIndent(edits, line, open.start.character);
        }
    }

    countParenStack(line) {
        let count = 0;

        for (let ndx = 0; ndx < line.length; ndx += 1) {
            if (line[ndx].type !== types.WHITE_SPACE && line[ndx].text !== ')') {
                break;
            }

            if (line[ndx].text === ')') {
                count += 1;
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

    fixBlankLine(line) {
        return line.length === 1
            && line[0].type === types.WHITE_SPACE
            && line[0].text.length > 0;
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
