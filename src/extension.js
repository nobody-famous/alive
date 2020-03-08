const types = require('./Types');
const { Range, window, workspace } = require('vscode');
const { Parser } = require('./Parser');
const { Colorizer } = require('./Colorizer');

let activeEditor = window.activeTextEditor;
const colorizer = new Colorizer();

const typeStyles = {};
typeStyles[types.OPEN_PARENS] = 'common_lisp.default';
typeStyles[types.CLOSE_PARENS] = 'common_lisp.default';

typeStyles[types.ID] = 'common_lisp.id';

typeStyles[types.DEFUN] = 'common_lisp.keyword';
typeStyles[types.IN_PACKAGE] = 'common_lisp.keyword';
typeStyles[types.DEFPACKAGE] = 'common_lisp.keyword';
typeStyles[types.TRUE] = 'common_lisp.keyword';
typeStyles[types.NIL] = 'common_lisp.keyword';

typeStyles[types.LET] = 'common_lisp.control';
typeStyles[types.LOAD] = 'common_lisp.control';
typeStyles[types.IF] = 'common_lisp.control';
typeStyles[types.LOOP] = 'common_lisp.control';
typeStyles[types.HANDLER_CASE] = 'common_lisp.control';
typeStyles[types.AND] = 'common_lisp.control';

typeStyles[types.FUNCTION] = 'common_lisp.function';
typeStyles[types.FORMAT] = 'common_lisp.function';
typeStyles[types.SETF] = 'common_lisp.function';

typeStyles[types.STRING] = 'common_lisp.string';

typeStyles[types.PACKAGE_NAME] = 'common_lisp.package';

typeStyles[types.SYMBOL] = 'common_lisp.symbol';

typeStyles[types.PARAMETER] = 'common_lisp.parameter';

typeStyles[types.MISMATCHED_OPEN_PARENS] = 'common_lisp.default';
typeStyles[types.MISMATCHED_CLOSE_PARENS] = 'common_lisp.error';
typeStyles[types.MISMATCHED_DBL_QUOTE] = 'common_lisp.error';

module.exports.activate = (ctx) => {
    window.onDidChangeActiveTextEditor(editor => {
        if (editor.document.languageId !== 'common-lisp') {
            return;
        }

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
    const parser = new Parser(activeEditor.document.getText());
    const map = {};

    const tokens = parser.parse();
    let mismatched = false;
    for (let ndx = 0; ndx < tokens.length; ndx += 1) {
        const token = tokens[ndx];
        let style = typeStyles[token.type] || 'common_lisp.default';
        const target = { range: new Range(token.start, token.end) };

        if (token.type === types.WHITE_SPACE) {
            continue;
        }

        if (mismatched) {
            style = 'common_lisp.error';
        }

        if (token.type === types.MISMATCHED_OPEN_PARENS || token.type === types.MISMATCHED_CLOSE_PARENS) {
            mismatched = true;
        }

        addToMap(map, style, target);
    }

    return map;
}

function addToMap(map, key, entry) {
    if (map[key] === undefined) {
        map[key] = [];
    }

    map[key].push(entry);
}
