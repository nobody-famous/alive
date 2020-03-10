const { languages, window, workspace } = require('vscode');
const { Colorizer } = require('./colorize/Colorizer');
const { Formatter } = require('./format/Formatter');
const { CompletionProvider } = require('./CompletionProvider');

const LANGUAGE_ID = 'common-lisp';
const colorizer = new Colorizer();
const completionProvider = new CompletionProvider();
const formatter = new Formatter();

let activeEditor = window.activeTextEditor;

module.exports.activate = (ctx) => {
    window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;

        if (editor.document.languageId === LANGUAGE_ID) {
            decorateText();
        }
    }, null, ctx.subscriptions);

    workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId !== LANGUAGE_ID) {
            return;
        }

        decorateText();
    });

    workspace.onDidChangeTextDocument(event => {
        if (!activeEditor || (event.document !== activeEditor.document)) {
            return;
        }

        decorateText();
    }, null, ctx.subscriptions);

    languages.registerCompletionItemProvider({ scheme: 'untitled', language: LANGUAGE_ID }, completionProvider);
    languages.registerCompletionItemProvider({ scheme: 'file', language: LANGUAGE_ID }, completionProvider);

    languages.registerDocumentFormattingEditProvider({ scheme: 'untitled', language: LANGUAGE_ID }, formatter);
    languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: LANGUAGE_ID }, formatter);

    decorateText();
};

function decorateText() {
    try {
        colorizer.run(activeEditor);
    } catch (err) {
        window.showErrorMessage(`Failed to colorize file: ${err.toString()}`);
    }
}
