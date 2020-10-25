import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { Token } from './Token'
import { Colorizer } from './colorize/Colorizer'
import { Formatter } from './format/Formatter'
import { CompletionProvider } from './CompletionProvider'
import { Parser } from './lisp/Parser'
import { findExpr } from './lisp/Expr'
import { Lexer } from './Lexer'
import { PackageMgr } from './lisp/PackageMgr'
import { SwankConn } from './swank/SwankConn'

const LANGUAGE_ID = 'common-lisp'
const colorizer = new Colorizer()
const pkgMgr = new PackageMgr()
const completionProvider = new CompletionProvider(pkgMgr)

let activeEditor = vscode.window.activeTextEditor
let lexTokenMap: { [index: string]: Token[] } = {}

module.exports.activate = (ctx: vscode.ExtensionContext) => {
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

    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'untitled', language: LANGUAGE_ID }, documentFormatter())
    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: LANGUAGE_ID }, documentFormatter())

    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.selectSexpr', selectSexpr))
    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.sendToRepl', sendToRepl))
    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.attachRepl', attachRepl))

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

    pkgMgr.process(exprs)
}

async function attachRepl() {
    const conn = new SwankConn('localhost', 4005)

    conn.on('error', (err) => console.log(err))
    conn.on('msg', (msg) => console.log(msg))
    conn.on('activate', (event) => console.log(event))
    conn.on('debug', (event) => console.log(event))
    conn.on('close', () => console.log('Connection closed'))

    try {
        await conn.connect()
    } catch (err) {
        console.log(err)
    }
}

function sendToRepl() {
    const session = vscode.debug.activeDebugSession
    if (session === undefined) {
        return
    }

    try {
        const editor = vscode.window.activeTextEditor
        if (editor === undefined || editor.document.languageId !== LANGUAGE_ID) {
            return
        }

        const expr = getTopExpr()
        const selection = editor.selection
        let range = undefined

        if (!selection.isEmpty) {
            range = new vscode.Range(selection.start, selection.end)
        } else if (expr !== undefined) {
            range = new vscode.Range(expr.start, expr.end)
        }

        if (range === undefined) {
            return
        }

        const text = editor.document.getText(range)

        session.customRequest('evaluate', { expression: text })
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
            editor.selection = new vscode.Selection(expr.start, expr.end)
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

        return expr
    } catch (err) {
        console.log(err)
    }

    return undefined
}

function getCompletionProvider(): vscode.CompletionItemProvider {
    return {
        provideCompletionItems(
            document: vscode.TextDocument,
            pos: vscode.Position,
            token: vscode.CancellationToken,
            ctx: vscode.CompletionContext
        ) {
            try {
                const exprs = getDocumentExprs(document)
                return completionProvider.getCompletions(exprs, pos)
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

function getDocumentExprs(doc: vscode.TextDocument) {
    const lex = new Lexer(doc.getText())
    const tokens = lex.getTokens()
    const parser = new Parser(tokens)
    const exprs = parser.parse()

    pkgMgr.process(exprs)

    return exprs
}

function decorateText(tokens: Token[]) {
    try {
        if (activeEditor !== undefined) {
            colorizer.run(activeEditor, tokens)
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to colorize file: ${err.toString()}`)
    }
}
