const vscode = require('vscode');
const { Session } = require('./debug/session');
const { Colorizer } = require('./colorize/Colorizer');
const { Formatter } = require('./format/Formatter');
const { CompletionProvider } = require('./CompletionProvider');
const { Parser } = require('./lisp/Parser');
const { Lexer } = require('./Lexer');

class InlineDebugAdapterFactory {
    createDebugAdapterDescriptor(_session) {
        return new vscode.DebugAdapterInlineImplementation(new Session());
    }
}

const LANGUAGE_ID = 'common-lisp';
const colorizer = new Colorizer();
const completionProvider = new CompletionProvider();
const factory = new InlineDebugAdapterFactory();

let activeEditor = vscode.window.activeTextEditor;
let lexTokenMap = {};

module.exports.activate = (ctx) => {
    vscode.window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;

        if (editor.document.languageId !== LANGUAGE_ID) {
            return;
        }

        if (lexTokenMap[editor.fileName] === undefined) {
            readLexTokens(editor.document);
        }

        decorateText(lexTokenMap[editor.document.fileName]);
    }, null, ctx.subscriptions);

    vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId !== LANGUAGE_ID) {
            return;
        }

        readLexTokens(activeEditor.document);
        decorateText(lexTokenMap[doc.fileName]);
    });

    vscode.workspace.onDidChangeTextDocument(event => {
        if (!activeEditor || (activeEditor.document.languageId !== LANGUAGE_ID) || (event.document !== activeEditor.document)) {
            return;
        }

        readLexTokens(activeEditor.document);
        decorateText(lexTokenMap[activeEditor.document.fileName]);
    }, null, ctx.subscriptions);

    vscode.languages.registerCompletionItemProvider({ scheme: 'untitled', language: LANGUAGE_ID }, getCompletionProvider());
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: LANGUAGE_ID }, getCompletionProvider());

    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'untitled', language: LANGUAGE_ID }, documentFormatter());
    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: LANGUAGE_ID }, documentFormatter());

    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.selectSexpr', selectSexpr));
    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.sendToRepl', sendToRepl));
    ctx.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('common-lisp-repl', factory));
    ctx.subscriptions.push(factory);

    if (activeEditor.document.languageId !== LANGUAGE_ID) {
        return;
    }

    readLexTokens(activeEditor.document);
    decorateText(lexTokenMap[activeEditor.document.fileName]);
};

function sendToRepl() {
    const session = vscode.debug.activeDebugSession;
    if (session === undefined) {
        return;
    }

    try {
        const editor = vscode.window.activeTextEditor;
        if (editor.document.languageId !== LANGUAGE_ID) {
            return;
        }

        const form = getTopForm();
        const selection = editor.selection;
        let range = undefined;

        if (!selection.isEmpty) {
            range = new vscode.Range(selection.start, selection.end);
        } else if (form !== undefined) {
            range = new vscode.Range(form.open.start, form.close.end);
        }

        if (range === undefined) {
            return;
        }

        const text = editor.document.getText(range);

        session.customRequest('evaluate', { expression: text });
    } catch (err) {
        console.log(err);
    }
}

function selectSexpr() {
    try {
        const form = getTopForm();

        if (form !== undefined) {
            editor.selection = new vscode.Selection(form.open.start, form.close.end);
        }
    } catch (err) {
        console.log(err);
    }
}

function getTopForm() {
    try {
        const editor = vscode.window.activeTextEditor;
        if (editor.document.languageId !== LANGUAGE_ID) {
            return undefined;
        }

        const ast = getDocumentAST(editor.document);
        const pos = editor.selection.start;
        const node = ast.getPositionNode(pos);

        if (node.open === undefined || node.close === undefined) {
            return undefined;
        }

        return node;
    } catch (err) {
        console.log(err);
    }

    return undefined;
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
        vscode.window.showErrorMessage(`Failed to colorize file: ${err.toString()}`);
    }
}
