const types = require('./Types');
const { Range, window, workspace } = require('vscode');
const { Lexer } = require('./Lexer');
const { Colorizer } = require('./Colorizer');

let activeEditor = window.activeTextEditor;
const colorizer = new Colorizer();

module.exports.activate = (ctx) => {
    window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;

        try {
            decorateText();
        } catch (err) {
            console.log(err);
        }
    }, null, ctx.subscriptions);

    workspace.onDidChangeTextDocument(event => {
        if (!activeEditor || (event.document !== activeEditor.document)) {
            return;
        }

        try {
            decorateText();
        } catch (err) {
            console.log(err);
        }
    }, null, ctx.subscriptions);

    try {
        decorateText();
    } catch (err) {
        console.log(err);
    }
};

function decorateText() {
    const styleMap = buildStyleMap();

    colorizer.colorize(activeEditor, styleMap);
}

function buildStyleMap() {
    const lex = new Lexer(activeEditor.document.getText());
    const map = {};

    const tokens = lex.getTokens();
    let mismatched = false;
    for (let ndx = 0; ndx < tokens.length; ndx += 1) {
        const token = tokens[ndx];

        if (token.type === types.MISMATCHED_CLOSE_PARENS) {
            mismatched = true;
            addToMap(map, 'common_lisp.mismatched_parens', { range: new Range(token.start, token.end) });
        } else if (token.type === types.MISMATCHED_OPEN_PARENS) {
            mismatched = true;
        } else if (mismatched && token.type !== types.WHITE_SPACE) {
            addToMap(map, 'common_lisp.mismatched_parens', { range: new Range(token.start, token.end) });
        } else if (token.type === types.WHITE_SPACE) {
            addToMap(map, 'editorWhitespace.foreground', { range: new Range(token.start, token.end) });
        } else {
            addToMap(map, 'common_lisp.default', { range: new Range(token.start, token.end) });
        }
    }

    return map;
}

function addToMap(map, key, entry) {
    if (map[key] === undefined) {
        map[key] = [];
    }

    map[key].push(entry);
}
