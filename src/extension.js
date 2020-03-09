const { languages, window, workspace } = require('vscode');
const { Colorizer } = require('./colorize/Colorizer');
const { CompletionProvider } = require('./CompletionProvider');

const LANGUAGE_ID = 'common-lisp';
const colorizer = new Colorizer();

let activeEditor = window.activeTextEditor;

module.exports.activate = (ctx) => {
    window.onDidChangeActiveTextEditor(editor => {
        if (editor.document.languageId !== LANGUAGE_ID) {
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

    languages.registerCompletionItemProvider(LANGUAGE_ID, new CompletionProvider());

    decorateText();
};

function decorateText() {
    try {
        colorizer.run(activeEditor);
    } catch (err) {
        console.log(err);
    }
}
