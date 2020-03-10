const types = require('../Types');
const { format } = require('util');
const { Lexer } = require('../Lexer');
const { State } = require('./State');
const { Range, TextEdit } = require('vscode');

module.exports.Formatter = class {
    provideDocumentFormattingEdits(doc, opts) {
        const lex = new Lexer(doc.getText());
        const tokens = lex.getTokens();
        const state = new State(tokens);
        const edits = [];

        if (tokens.length === 0) {
            return;
        }

        state.setOptions(opts);

        this.removeBlankLines(edits, state);
        if (tokens[0].type === types.WHITE_SPACE) {
            edits.push(TextEdit.delete(
                new Range(tokens[0].start, tokens[1].start),
            ));
        }

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
