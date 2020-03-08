const { window } = require('vscode');

const decorationTypes = {
    'common_lisp.default': window.createTextEditorDecorationType({ color: { id: 'common_lisp.default' } }),
    'common_lisp.mismatched_parens': window.createTextEditorDecorationType({ color: { id: 'common_lisp.mismatched_parens' } }),
    'editorWhitespace.foreground': window.createTextEditorDecorationType({ color: { id: 'editorWhitespace.foreground' } }),
}

module.exports.Colorizer = class {
    constructor() { }

    colorize(editor, styleMap) {
        const entries = Object.entries(styleMap);

        for (let ndx = 0; ndx < entries.length; ndx += 1) {
            const [style, list] = entries[ndx];
            const decoration = decorationTypes[style];

            if (decoration === undefined) {
                continue;
            }

            editor.setDecorations(decoration, list);
        }
    }
};
