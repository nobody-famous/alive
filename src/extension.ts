import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { Expr, findExpr, Lexer, PackageMgr, Parser, Token } from './lisp'
import { Colorizer } from './vscode/colorize/Colorizer'
import { CompletionProvider } from './vscode/CompletionProvider'
import { Formatter } from './vscode/format/Formatter'
import * as repl from './vscode/repl'
import { getHelp } from './vscode/SigHelp'
import { getDocumentExprs, toVscodePos } from './vscode/Utils'

const LANGUAGE_ID = 'common-lisp'
const colorizer = new Colorizer()
const pkgMgr = new PackageMgr()
const completionProvider = new CompletionProvider(pkgMgr)

let clRepl: repl.Repl | undefined = undefined
let activeEditor = vscode.window.activeTextEditor
let lexTokenMap: { [index: string]: Token[] } = {}

export const activate = (ctx: vscode.ExtensionContext) => {
    vscode.window.onDidChangeActiveTextEditor(
        (editor?: vscode.TextEditor) => {
            activeEditor = editor

            if (editor === undefined || editor.document.languageId !== LANGUAGE_ID) {
                return
            }

            if (lexTokenMap[editor.document.fileName] === undefined) {
                readLexTokens(editor.document.fileName, editor.document.getText())
            }

            decorateText(lexTokenMap[editor.document.fileName])
        },
        null,
        ctx.subscriptions
    )

    vscode.workspace.onDidOpenTextDocument((doc) => {
        if (activeEditor === undefined || doc.languageId !== LANGUAGE_ID) {
            return
        }

        readLexTokens(activeEditor.document.fileName, activeEditor.document.getText())
        decorateText(lexTokenMap[doc.fileName])
    })

    vscode.workspace.onDidChangeTextDocument(
        (event) => {
            if (!activeEditor || activeEditor.document.languageId !== LANGUAGE_ID || event.document !== activeEditor.document) {
                return
            }

            readLexTokens(activeEditor.document.fileName, activeEditor.document.getText())
            decorateText(lexTokenMap[activeEditor.document.fileName])
        },
        null,
        ctx.subscriptions
    )

    vscode.languages.registerCompletionItemProvider({ scheme: 'untitled', language: LANGUAGE_ID }, getCompletionProvider())
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: LANGUAGE_ID }, getCompletionProvider())

    vscode.languages.registerSignatureHelpProvider({ scheme: 'untitled', language: LANGUAGE_ID }, getSigHelpProvider(), ' ', ' ')
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: LANGUAGE_ID }, getSigHelpProvider(), ' ', ' ')

    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'untitled', language: LANGUAGE_ID }, documentFormatter())
    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: LANGUAGE_ID }, documentFormatter())

    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.selectSexpr', selectSexpr))
    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.sendToRepl', sendToRepl))
    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.attachRepl', attachRepl(ctx)))

    if (activeEditor === undefined || activeEditor.document.languageId !== LANGUAGE_ID) {
        return
    }

    readLexTokens(activeEditor.document.fileName, activeEditor.document.getText())
    decorateText(lexTokenMap[activeEditor.document.fileName])
    readPackageLisp()
}

async function readPackageLisp() {
    if (vscode.workspace.workspaceFolders === undefined) {
        return
    }

    const folder = vscode.workspace.workspaceFolders[0]
    const pkgFile = path.join(folder.uri.path, 'package.lisp')

    if (!fs.existsSync(pkgFile) || !fs.lstatSync(pkgFile).isFile()) {
        return
    }

    const textBuf = await fs.promises.readFile(pkgFile)
    readLexTokens(pkgFile, textBuf.toString())

    const parser = new Parser(lexTokenMap[pkgFile])
    const exprs = parser.parse()

    pkgMgr.update(exprs)
}

function attachRepl(ctx: vscode.ExtensionContext): () => void {
    return async () => {
        try {
            if (activeEditor?.document.languageId !== LANGUAGE_ID) {
                vscode.window.showErrorMessage(`Not in a ${LANGUAGE_ID} document`)
                return
            }

            if (clRepl !== undefined) {
                vscode.window.showInformationMessage('Already attached...')
                return
            }

            await newReplConnection()
        } catch (err) {
            console.log(err)
        }
    }
}

async function newReplConnection() {
    clRepl = new repl.Repl('localhost', 4005)

    clRepl.on('close', () => (clRepl = undefined))

    await clRepl.connect()
}

function getExprRange(editor: vscode.TextEditor, expr: Expr): vscode.Range {
    const selection = editor.selection

    if (!selection.isEmpty) {
        return new vscode.Range(selection.start, selection.end)
    }

    return new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))
}

async function sendToRepl() {
    if (clRepl === undefined) {
        return
    }

    try {
        const editor = vscode.window.activeTextEditor
        if (editor === undefined || editor.document.languageId !== LANGUAGE_ID) {
            return
        }

        const expr = getTopExpr()
        if (expr === undefined) {
            return
        }

        const range = getExprRange(editor, expr)
        const text = editor.document.getText(range)

        await clRepl.send(text)
    } catch (err) {
        console.log(err)
    }
}

function selectSexpr() {
    try {
        const editor = vscode.window.activeTextEditor
        if (editor === undefined || editor.document.languageId !== LANGUAGE_ID) {
            return
        }

        const expr = getTopExpr()

        if (expr !== undefined) {
            editor.selection = new vscode.Selection(toVscodePos(expr.start), toVscodePos(expr.end))
        }
    } catch (err) {
        console.log(err)
    }
}

function getTopExpr() {
    try {
        const editor = vscode.window.activeTextEditor
        if (editor === undefined || editor.document.languageId !== LANGUAGE_ID) {
            return undefined
        }

        const exprs = getDocumentExprs(editor.document)
        const pos = editor.selection.start
        const expr = findExpr(exprs, pos)

        if (expr === undefined || expr.start === undefined || expr.end === undefined) {
            return undefined
        }

        pkgMgr.update(exprs)

        return expr
    } catch (err) {
        console.log(err)
    }

    return undefined
}

function getSigHelpProvider(): vscode.SignatureHelpProvider {
    return {
        async provideSignatureHelp(
            document: vscode.TextDocument,
            pos: vscode.Position,
            token: vscode.CancellationToken,
            ctx: vscode.SignatureHelpContext
        ): Promise<vscode.SignatureHelp> {
            return await getHelp(clRepl, document, pos)
            // const exprs = getDocumentExprs(document)
            // const expr = findExpr(exprs, pos)

            // const sig = new vscode.SignatureInformation('(foo (bar fly))')

            // sig.parameters = [new vscode.ParameterInformation([6, 9]), new vscode.ParameterInformation([10, 13])]

            // return {
            //     activeParameter: 0,
            //     activeSignature: 0,
            //     signatures: [sig],
            // }
        },
    }
}

function getCompletionProvider(): vscode.CompletionItemProvider {
    return {
        async provideCompletionItems(
            document: vscode.TextDocument,
            pos: vscode.Position,
            token: vscode.CancellationToken,
            ctx: vscode.CompletionContext
        ) {
            try {
                const exprs = getDocumentExprs(document)
                pkgMgr.update(exprs)
                return await completionProvider.getCompletions(clRepl, exprs, pos)
            } catch (err) {
                console.log(err)
                return []
            }
        },
    }
}

function readLexTokens(fileName: string, text: string) {
    const lex = new Lexer(text)

    lexTokenMap[fileName] = lex.getTokens()
}

function documentFormatter(): vscode.DocumentFormattingEditProvider {
    return {
        provideDocumentFormattingEdits(doc: vscode.TextDocument, opts: vscode.FormattingOptions) {
            const lex = new Lexer(doc.getText())
            const tokens = lex.getTokens()
            const formatter = new Formatter(doc, opts, tokens)

            const edits = formatter.format()
            return edits.length > 0 ? edits : undefined
        },
    }
}

// function getDocumentExprs(doc: vscode.TextDocument) {
//     const lex = new Lexer(doc.getText())
//     const tokens = lex.getTokens()
//     const parser = new Parser(tokens)
//     const exprs = parser.parse()

//     pkgMgr.update(exprs)

//     return exprs
// }

function decorateText(tokens: Token[]) {
    try {
        if (activeEditor !== undefined) {
            colorizer.run(activeEditor, tokens)
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to colorize file: ${err.toString()}`)
    }
}
