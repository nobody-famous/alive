const { languages, window, workspace } = require('vscode');
const { Colorizer } = require('./colorize/Colorizer');
const { Formatter } = require('./format/Formatter');
const { CompletionProvider } = require('./CompletionProvider');
const { Parser } = require('./lisp/Parser');
const { Lexer } = require('./Lexer');

const LANGUAGE_ID = 'common-lisp';
const colorizer = new Colorizer();
const completionProvider = new CompletionProvider();
const formatter = new Formatter();

let activeEditor = window.activeTextEditor;

module.exports.activate = (ctx) => {
    window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;

        if (editor.document.languageId === LANGUAGE_ID) {
            const lex = new Lexer(activeEditor.document.getText());
            const tokens = lex.getTokens();
            decorateText(tokens);
        }
    }, null, ctx.subscriptions);

    workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId !== LANGUAGE_ID) {
            return;
        }

        const lex = new Lexer(activeEditor.document.getText());
        const tokens = lex.getTokens();
        decorateText(tokens);
    });

    workspace.onDidChangeTextDocument(event => {
        if (!activeEditor || (event.document !== activeEditor.document)) {
            return;
        }

        const lex = new Lexer(activeEditor.document.getText());
        const tokens = lex.getTokens();
        decorateText(tokens);
    }, null, ctx.subscriptions);

    languages.registerCompletionItemProvider({ scheme: 'untitled', language: LANGUAGE_ID }, completionProvider);
    languages.registerCompletionItemProvider({ scheme: 'file', language: LANGUAGE_ID }, completionProvider);

    languages.registerDocumentFormattingEditProvider({ scheme: 'untitled', language: LANGUAGE_ID }, documentFormatter());
    languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: LANGUAGE_ID }, documentFormatter());

    const lex = new Lexer(activeEditor.document.getText());
    const tokens = lex.getTokens();
    const parser = new Parser(tokens);
    parser.parse();

    decorateText(tokens);
};

function documentFormatter() {
    return {
        provideDocumentFormattingEdits(doc, opts) {
            const lex = new Lexer(activeEditor.document.getText());
            const tokens = lex.getTokens();
            const parser = new Parser(tokens);
            const ast = parser.parse();
            const formatter = new Formatter(doc, opts, ast);

            return formatter.format();
        }
    };
}

function decorateText(tokens) {
    try {
        colorizer.run(activeEditor, tokens);
    } catch (err) {
        window.showErrorMessage(`Failed to colorize file: ${err.toString()}`);
    }
}
