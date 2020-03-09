const { window, workspace } = require('vscode');
const { Colorizer } = require('./colorize/Colorizer');

let activeEditor = window.activeTextEditor;
const colorizer = new Colorizer();

module.exports.activate = (ctx) => {
    window.onDidChangeActiveTextEditor(editor => {
        if (editor.document.languageId !== 'common-lisp') {
            return;
        }

        activeEditor = editor;

        decorateText();
    }, null, ctx.subscriptions);

    workspace.onDidChangeTextDocument(event => {
        if (!activeEditor || (event.document !== activeEditor.document)) {
            return;
        }

        decorateText();
    }, null, ctx.subscriptions);

    try {
        decorateText();
    } catch (err) {
        console.log(err);
    }
};

function decorateText() {
    try {
        colorizer.run(activeEditor);
    } catch (err) {
        console.log(err);
    }
}
