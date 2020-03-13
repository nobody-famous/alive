const types = require('../Types');
const { Token } = require('../Token');
const { format } = require('util');
const { State } = require('./State');
const { Position, Range, TextEdit } = require('vscode');

module.exports.Formatter = class {
    constructor(doc, opts, ast) {
        this.ast = ast;
        this.parens = [];
        this.elems = [];

        this.indentSize = 3;
    }

    format() {
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
            case types.DEFPACKAGE:
                return this.fixDefPackageElem(edits, lines[lineNdx]);
            default:
                console.log(`fixChildElem in ${token.type} ${token.text}, line ${lineNdx}`);
        }
    }

    fixDefPackageElem(edits, line) {
        this.fixIndent(edits, line, this.indentSize);
    }

    fixCloseParen(edits, lines, lineNdx) {
        const line = lines[lineNdx];
        const open = this.parens.pop();

        this.fixIndent(edits, line, open.start.character);

        // Put the open parens back so that the code to check for matching parens sees it.
        this.parens.push(open);
    }

    fixIndent(edits, line, target) {
        const token = line[0];

        if (token.type !== types.WHITE_SPACE) {
            return;
        }

        if (token.text.length > target) {
            const end = new Position(token.start.line, token.end.character - target);
            edits.push(TextEdit.delete(new Range(token.start, end)));

            if (line[1].text === '(') {
                line[1].start = new Position(line[1].start.line, target);
            }
        } else if (token.text.length < target) {
            const diff = target - token.text.length;
            edits.push(TextEdit.insert(new Position(token.start.line, 0), ' '.repeat(diff)));
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
                this.splitWS(lines, node.value);
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

    splitWS(lines, token) {
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
            const newToken = new Token(types.WHITE_SPACE, start, end, splits[ndx]);

            startChar += splits[ndx].length;
            if (curLine !== startLine) {
                lines.push([newToken]);
            } else {
                lines[lines.length - 1].push(newToken);
            }
        }
    }
};
