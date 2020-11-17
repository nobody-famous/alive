import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { Expr, findExpr, getLexTokens, Lexer, PackageMgr, Parser, readLexTokens } from './lisp'
import { CompletionProvider } from './vscode/CompletionProvider'
import { Formatter } from './vscode/format/Formatter'
import * as repl from './vscode/repl'
import { getHelp } from './vscode/SigHelp'
import { decorateText, getDocumentExprs, toVscodePos } from './vscode/Utils'

const COMMON_LISP_ID = 'common-lisp'
const REPL_ID = 'common-lisp-repl'
const pkgMgr = new PackageMgr()
const completionProvider = new CompletionProvider(pkgMgr)

let clRepl: repl.Repl | undefined = undefined
let activeEditor = vscode.window.activeTextEditor

export const activate = (ctx: vscode.ExtensionContext) => {
    vscode.window.onDidChangeActiveTextEditor((editor?: vscode.TextEditor) => editorChanged(editor), null, ctx.subscriptions)
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => openTextDocument(doc))
    vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent) => changeTextDocument(event),
        null,
        ctx.subscriptions
    )

    vscode.languages.registerCompletionItemProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getCompletionProvider())
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: COMMON_LISP_ID }, getCompletionProvider())
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: REPL_ID }, getCompletionProvider())

    vscode.languages.registerSignatureHelpProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getSigHelpProvider(), ' ')
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: COMMON_LISP_ID }, getSigHelpProvider(), ' ')
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: REPL_ID }, getSigHelpProvider(), ' ')

    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, documentFormatter())
    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: COMMON_LISP_ID }, documentFormatter())

    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.selectSexpr', selectSexpr))
    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.sendToRepl', sendToRepl))
    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.attachRepl', attachRepl(ctx)))
    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.compileFile', compileFile))
    ctx.subscriptions.push(vscode.commands.registerCommand('common-lisp.evalFile', evalFile))

    if (activeEditor === undefined || !hasValidLangId(activeEditor.document)) {
        return
    }

    readLexTokens(activeEditor.document.fileName, activeEditor.document.getText())
    decorateText(activeEditor, getLexTokens(activeEditor.document.fileName) ?? [])
    readPackageLisp()
}

function hasValidLangId(doc?: vscode.TextDocument): boolean {
    return doc?.languageId === COMMON_LISP_ID || doc?.languageId === REPL_ID
}

function editorChanged(editor?: vscode.TextEditor) {
    activeEditor = editor

    if (editor === undefined || !hasValidLangId(editor.document)) {
        return
    }

    let tokens = getLexTokens(editor.document.fileName)
    if (tokens === undefined) {
        tokens = readLexTokens(editor.document.fileName, editor.document.getText())
    }

    decorateText(activeEditor, tokens ?? [])
}

function openTextDocument(doc: vscode.TextDocument) {
    if (activeEditor === undefined || !hasValidLangId(doc)) {
        return
    }

    readLexTokens(activeEditor.document.fileName, activeEditor.document.getText())
    decorateText(activeEditor, getLexTokens(activeEditor.document.fileName) ?? [])
}

function changeTextDocument(event: vscode.TextDocumentChangeEvent) {
    if (!hasValidLangId(activeEditor?.document) || event.document !== activeEditor?.document) {
        return
    }

    readLexTokens(activeEditor.document.fileName, activeEditor.document.getText())
    decorateText(activeEditor, getLexTokens(activeEditor.document.fileName) ?? [])
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

    const parser = new Parser(getLexTokens(pkgFile) ?? [])
    const exprs = parser.parse()

    pkgMgr.update(exprs)
}

async function evalFile() {
    if (clRepl === undefined || activeEditor?.document.languageId !== COMMON_LISP_ID) {
        return
    }

    const exprs = getDocumentExprs(activeEditor.document)

    for (const expr of exprs) {
        const range = new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))
        const text = activeEditor.document.getText(range)

        await clRepl.send(text, false)
    }

    await clRepl.updateConnInfo()
}

async function compileFile() {
    if (clRepl === undefined || activeEditor?.document.languageId !== COMMON_LISP_ID) {
        return
    }

    await clRepl.compileFile(activeEditor.document.fileName)
}

function attachRepl(ctx: vscode.ExtensionContext): () => void {
    return async () => {
        try {
            if (activeEditor?.document.languageId !== COMMON_LISP_ID) {
                vscode.window.showErrorMessage(`Not in a ${COMMON_LISP_ID} document`)
                return
            }

            await newReplConnection()
        } catch (err) {
            console.log(err)
        }
    }
}

async function newReplConnection() {
    if (clRepl === undefined) {
        clRepl = new repl.Repl('localhost', 4005)
        clRepl.on('close', () => (clRepl = undefined))
    }

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
        vscode.window.showErrorMessage('REPL not connected')
        return
    }

    try {
        const editor = vscode.window.activeTextEditor
        if (!hasValidLangId(editor?.document)) {
            return
        }

        const expr = getTopExpr()
        if (editor === undefined || expr === undefined) {
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
        if (editor === undefined || !hasValidLangId(editor.document)) {
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
        if (editor === undefined || !hasValidLangId(editor.document)) {
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
