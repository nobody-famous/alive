const { languages, window, workspace } = require('vscode');
const { Colorizer } = require('./colorize/Colorizer');
const { Formatter } = require('./format/Formatter');
const { CompletionProvider } = require('./CompletionProvider');
const { Parser } = require('./lisp/Parser');
const { Lexer } = require('./Lexer');

const LANGUAGE_ID = 'common-lisp';
const colorizer = new Colorizer();
const completionProvider = new CompletionProvider();

let activeEditor = window.activeTextEditor;
let lexTokenMap = {};

module.exports.activate = (ctx) => {
    window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;

        if (editor.document.languageId !== LANGUAGE_ID) {
            return;
        }

        if (lexTokenMap[editor.fileName] === undefined) {
            readLexTokens(editor.document);
        }

        decorateText(lexTokenMap[editor.document.fileName]);
    }, null, ctx.subscriptions);

    workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId !== LANGUAGE_ID) {
            return;
        }

        readLexTokens(activeEditor.document);
        decorateText(lexTokenMap[doc.fileName]);
    });

    workspace.onDidChangeTextDocument(event => {
        if (!activeEditor || (activeEditor.document.languageId !== LANGUAGE_ID) || (event.document !== activeEditor.document)) {
            return;
        }

        readLexTokens(activeEditor.document);
        decorateText(lexTokenMap[activeEditor.document.fileName]);
    }, null, ctx.subscriptions);

    languages.registerCompletionItemProvider({ scheme: 'untitled', language: LANGUAGE_ID }, completionProvider);
    languages.registerCompletionItemProvider({ scheme: 'file', language: LANGUAGE_ID }, completionProvider);

    languages.registerDocumentFormattingEditProvider({ scheme: 'untitled', language: LANGUAGE_ID }, documentFormatter());
    languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: LANGUAGE_ID }, documentFormatter());

    if (activeEditor.document.languageId !== LANGUAGE_ID) {
        return;
    }

    readLexTokens(activeEditor.document);
    decorateText(lexTokenMap[activeEditor.document.fileName]);
};

function readLexTokens(doc) {
    const lex = new Lexer(doc.getText());

    lexTokenMap[doc.fileName] = lex.getTokens();
}

function documentFormatter() {
    return {
        provideDocumentFormattingEdits(doc, opts) {
            const lex = new Lexer(activeEditor.document.getText());
            const tokens = lex.getTokens();
            const parser = new Parser(tokens);
            const ast = parser.parse();
            const formatter = new Formatter(doc, opts, ast);

            const edits = formatter.format();
            return edits.length > 0 ? edits : undefined;
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
