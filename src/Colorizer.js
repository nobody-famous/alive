const { window } = require('vscode');

const decorationTypes = {
    'common_lisp.default': window.createTextEditorDecorationType({ color: { id: 'common_lisp.default' } }),
    'common_lisp.error': window.createTextEditorDecorationType({ color: { id: 'common_lisp.error' } }),
    'common_lisp.keyword': window.createTextEditorDecorationType({ color: { id: 'common_lisp.keyword' } }),
    'common_lisp.control': window.createTextEditorDecorationType({ color: { id: 'common_lisp.control' } }),
    'common_lisp.function': window.createTextEditorDecorationType({ color: { id: 'common_lisp.function' } }),
    'common_lisp.string': window.createTextEditorDecorationType({ color: { id: 'common_lisp.string' } }),
    'common_lisp.package': window.createTextEditorDecorationType({ color: { id: 'common_lisp.package' } }),
    'common_lisp.symbol': window.createTextEditorDecorationType({ color: { id: 'common_lisp.symbol' } }),
    'editorWhitespace.foreground': window.createTextEditorDecorationType({ color: { id: 'editorWhitespace.foreground' } }),
}

module.exports.Colorizer = class {
    constructor() { }

    colorize(editor, styleMap) {
        const entries = Object.entries(styleMap);

        this.clearEmptyTypes(editor, styleMap);

        for (let ndx = 0; ndx < entries.length; ndx += 1) {
            const [style, list] = entries[ndx];
            const decoration = decorationTypes[style];

            if (decoration === undefined) {
                continue;
            }

            editor.setDecorations(decoration, list);
        }
    }

    clearEmptyTypes(editor, styleMap) {
        const styles = Object.keys(decorationTypes);

        for (let ndx = 0; ndx < styles.length; ndx += 1) {
            const style = styles[ndx];

            if (styleMap[style] === undefined) {
                editor.setDecorations(decorationTypes[style], []);
            }
        }
    }
};
