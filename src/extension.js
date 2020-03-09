const { CompletionItem, languages, MarkdownString, window, workspace } = require('vscode');
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
    // languages.registerCompletionItemProvider(LANGUAGE_ID, {
    //     provideCompletionItems(document, pos, token, ctx) {
    //         const test = new CompletionItem('console');
    //         test.commitCharacters = ['.'];
    //         test.documentation = new MarkdownString('Press `.` to get `console.`');

    //         return [
    //             test,
    //             new CompletionItem('Hello, World!'),
    //             new CompletionItem('Something'),
    //             new CompletionItem('Other Thing'),
    //             new CompletionItem('Next Thing'),
    //         ];
    //     }
    // });

    decorateText();
};

function decorateText() {
    try {
        colorizer.run(activeEditor);
    } catch (err) {
        console.log(err);
    }
}
