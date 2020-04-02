const { commands, languages, Selection, window, workspace } = require('vscode');
const { Colorizer } = require('./colorize/Colorizer');
const { Formatter } = require('./format/SMFormatter');
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

    languages.registerCompletionItemProvider({ scheme: 'untitled', language: LANGUAGE_ID }, getCompletionProvider());
    languages.registerCompletionItemProvider({ scheme: 'file', language: LANGUAGE_ID }, getCompletionProvider());

    languages.registerDocumentFormattingEditProvider({ scheme: 'untitled', language: LANGUAGE_ID }, documentFormatter());
    languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: LANGUAGE_ID }, documentFormatter());

    ctx.subscriptions.push(commands.registerCommand('common-lisp.selectSexpr', selectSexpr));

    if (activeEditor.document.languageId !== LANGUAGE_ID) {
        return;
    }

    readLexTokens(activeEditor.document);
    decorateText(lexTokenMap[activeEditor.document.fileName]);
};

function selectSexpr() {
    try {
        const editor = window.activeTextEditor;
        if (editor.document.languageId !== LANGUAGE_ID) {
            return;
        }

        const ast = getDocumentAST(editor.document);
        const pos = editor.selection.start;
        const node = ast.getPositionNode(pos);

        if (node.open === undefined || node.close === undefined) {
            return;
        }

        editor.selection = new Selection(node.open.start, node.close.end);
    } catch (err) {
        console.log(err);
    }
}

function getCompletionProvider() {
    return {
        provideCompletionItems(document, pos, token, ctx) {
            try {
                const ast = getDocumentAST(document);
                return completionProvider.getCompletions(ast, pos);
            } catch (err) {
                console.log(err);
                return [];
            }
        }
    };
}

function readLexTokens(doc) {
    const lex = new Lexer(doc.getText());

    lexTokenMap[doc.fileName] = lex.getTokens();
}

function documentFormatter() {
    return {
        provideDocumentFormattingEdits(doc, opts) {
            const lex = new Lexer(doc.getText());
            const tokens = lex.getTokens();
            const formatter = new Formatter(doc, opts, tokens);

            const edits = formatter.format();
            return edits.length > 0 ? edits : undefined;
        }
    };
}

function getDocumentAST(doc) {
    const lex = new Lexer(doc.getText());
    const tokens = lex.getTokens();
    const parser = new Parser(tokens);

    return parser.parse();
}

function decorateText(tokens) {
    try {
        colorizer.run(activeEditor, tokens);
    } catch (err) {
        window.showErrorMessage(`Failed to colorize file: ${err.toString()}`);
    }
}
