const types = require('../Types');
const { format } = require('util');
const { Parser } = require('./Parser');
const { State } = require('./State');
const { Position, Range, TextEdit } = require('vscode');

module.exports.Formatter = class {
    provideDocumentFormattingEdits(doc, opts) {
        const parser = new Parser(doc.getText());
        const exprList = parser.parse();
        // const state = new State(tokens);
        const edits = [];

        if (exprList.length === 0) {
            return;
        }

        // state.setOptions(opts);

        // this.removeBlankLines(edits, state);
        // if (tokens[0].type === types.WHITE_SPACE) {
        //     edits.push(TextEdit.delete(
        //         new Range(tokens[0].start, tokens[1].start),
        //     ));
        // }

        return edits;
    }

    removeBlankLines(edits, state) {
        const start = (state.tokens[state.ndx] !== undefined && state.tokens[state.ndx] === types.WHITE_SPACE)
            ? state.tokens[state.ndx].start
            : undefined;

        while (state.tokens[state.ndx] !== undefined && state.tokens[state.ndx].type === types.WHITE_SPACE) {
            state.ndx += 1;
        }

        if (start === undefined) {
            return;
        }

        const end = state.tokens[state.ndx];
        if (end === undefined) {
            if (state.ndx === 0) {
                return;
            }

            end = state.tokens[state.ndx - 1];
        }

        edits.push(TextEdit.delete(new Range(start, end)));
    }
};
