import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { Atom, Expr, findExpr, getLexTokens, isString, Lexer, PackageMgr, Parser, readLexTokens } from './lisp'
import { CompletionProvider } from './vscode/CompletionProvider'
import { Formatter } from './vscode/format/Formatter'
import * as repl from './vscode/repl'
import { getHelp } from './vscode/SigHelp'
import { Colorizer, tokenModifiersLegend, tokenTypesLegend } from './vscode/colorize'
import { COMMON_LISP_ID, getDocumentExprs, REPL_ID, toVscodePos } from './vscode/Utils'
import { format } from 'util'

const pkgMgr = new PackageMgr()
const completionProvider = new CompletionProvider(pkgMgr)
const legend = new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend)

let clRepl: repl.Repl | undefined = undefined
let activeEditor = vscode.window.activeTextEditor

export const activate = (ctx: vscode.ExtensionContext) => {
    vscode.window.onDidChangeVisibleTextEditors((editors: vscode.TextEditor[]) => visibleEditorsChanged(editors))
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

    vscode.languages.registerDocumentSemanticTokensProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        semTokensProvider(),
        legend
    )
    vscode.languages.registerDocumentSemanticTokensProvider(
        { scheme: 'file', language: COMMON_LISP_ID },
        semTokensProvider(),
        legend
    )
    vscode.languages.registerDocumentSemanticTokensProvider({ scheme: 'file', language: REPL_ID }, semTokensProvider(), legend)

    ctx.subscriptions.push(vscode.commands.registerCommand('alive.selectSexpr', selectSexpr))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.sendToRepl', sendToRepl))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.attachRepl', attachRepl(ctx)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.compileFile', compileFile))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.evalFile', evalFile))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.debugAbort', debugAbort))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.nthRestart', nthRestart))

    if (activeEditor === undefined || !hasValidLangId(activeEditor.document)) {
        return
    }

    readLexTokens(activeEditor.document.fileName, activeEditor.document.getText())
    visibleEditorsChanged(vscode.window.visibleTextEditors)
    readPackageLisp()
}

function hasValidLangId(doc?: vscode.TextDocument): boolean {
    return doc?.languageId === COMMON_LISP_ID || doc?.languageId === REPL_ID
}

function visibleEditorsChanged(editors: vscode.TextEditor[]) {
    for (const editor of editors) {
        if (hasValidLangId(editor.document)) {
            readLexTokens(editor.document.fileName, editor.document.getText())
        }
    }
}

async function nthRestart(n: unknown) {
    if (clRepl === undefined) {
        vscode.window.showInformationMessage(`REPL not connected`)
        return
    }

    try {
        if (typeof n !== 'string') {
            return
        }

        const num = Number.parseInt(n)

        if (!Number.isNaN(num)) {
            await clRepl.nthRestart(num)
        }
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

function semTokensProvider(): vscode.DocumentSemanticTokensProvider {
    return {
        async provideDocumentSemanticTokens(
            doc: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.SemanticTokens> {
            const colorizer = new Colorizer()
            const tokens = getLexTokens(doc.fileName)
            const emptyTokens = new vscode.SemanticTokens(new Uint32Array(0))

            if (tokens === undefined || tokens.length === 0) {
                return emptyTokens
            }

            try {
                return colorizer.run(tokens)
            } catch (err) {
                vscode.window.showErrorMessage(format(err))
            }

            return emptyTokens
        },
    }
}

function updatePkgMgr(doc: vscode.TextDocument | undefined, exprs: Expr[]) {
    if (doc?.languageId !== COMMON_LISP_ID) {
        return
    }

    pkgMgr.update(doc?.fileName, exprs)
}

function debugAbort() {
    if (clRepl !== undefined) {
        clRepl.abort()
    }
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

    const parser = new Parser(getLexTokens(editor.document.fileName) ?? [])
    const exprs = parser.parse()

    updatePkgMgr(editor.document, exprs)
}

function openTextDocument(doc: vscode.TextDocument) {
    if (activeEditor === undefined || !hasValidLangId(doc)) {
        return
    }

    readLexTokens(activeEditor.document.fileName, activeEditor.document.getText())
}

function changeTextDocument(event: vscode.TextDocumentChangeEvent) {
    if (!hasValidLangId(event.document)) {
        return
    }

    readLexTokens(event.document.fileName, event.document.getText())

    const editor = findEditorForDoc(event.document)

    if (editor === undefined) {
        return
    }

    if (editor.document.languageId !== REPL_ID) {
        return
    }

    for (const change of event.contentChanges) {
        if (change.range !== undefined) {
            clRepl?.documentChanged()
        }
    }
}

function findEditorForDoc(doc: vscode.TextDocument): vscode.TextEditor | undefined {
    for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === doc) {
            return editor
        }
    }

    return undefined
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

    updatePkgMgr(undefined, exprs)
}

async function evalFile() {
    if (clRepl === undefined || activeEditor?.document.languageId !== COMMON_LISP_ID) {
        return
    }

    const editor = activeEditor
    const doc = editor.document
    const exprs = getDocumentExprs(doc)

    for (const expr of exprs) {
        if (expr instanceof Atom) {
            continue
        }

        const range = new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))
        const text = doc.getText(range)
        const pkg = pkgMgr.getPackageForLine(doc.fileName, expr.start.line)

        await clRepl.send(editor, text, pkg.name, false)
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

            await newReplConnection(ctx)
        } catch (err) {
            console.log(err)
        }
    }
}

async function newReplConnection(ctx: vscode.ExtensionContext) {
    if (clRepl === undefined) {
        clRepl = new repl.Repl(ctx, 'localhost', 4005)
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
        const pkg = pkgMgr.getPackageForLine(editor.document.fileName, expr.start.line)
        const pkgName = editor.document.languageId === REPL_ID ? clRepl.curPackage : pkg.name

        await clRepl.send(editor, text, pkgName)
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

        updatePkgMgr(editor.document, exprs)

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
                updatePkgMgr(document, exprs)
                return await completionProvider.getCompletions(document.fileName, clRepl, exprs, pos)
            } catch (err) {
                vscode.window.showErrorMessage(err)
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
