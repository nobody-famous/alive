import { format, TextEncoder } from 'util'
import * as vscode from 'vscode'
import { Expr, exprToString, findAtom, findExpr, findInnerExpr, getLexTokens, Lexer, Parser, readLexTokens, SExpr } from './lisp'
import { Colorizer, tokenModifiersLegend, tokenTypesLegend } from './vscode/colorize'
import { CompletionProvider } from './vscode/CompletionProvider'
import * as Skeleton from './vscode/SystemSkeleton'
import { DefinitionProvider } from './vscode/DefinitionProvider'
import * as fmt from './vscode/format/Formatter'
import { PackageMgr } from './vscode/PackageMgr'
import * as repl from './vscode/repl'
import { getHelp } from './vscode/SigHelp'
import {
    COMMON_LISP_ID,
    createFolder,
    getDocumentExprs,
    getTempFolder,
    jumpToTop,
    openFile,
    REPL_ID,
    toVscodePos,
} from './vscode/Utils'

const pkgMgr = new PackageMgr()
const completionProvider = new CompletionProvider(pkgMgr)
const legend = new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend)

let clRepl: repl.Repl | undefined = undefined
let clReplHistory: repl.History = new repl.History()
let activeEditor = vscode.window.activeTextEditor
let hoverText: string = ''

export const activate = async (ctx: vscode.ExtensionContext) => {
    vscode.window.onDidChangeVisibleTextEditors((editors: vscode.TextEditor[]) => visibleEditorsChanged(editors))
    vscode.window.onDidChangeActiveTextEditor((editor?: vscode.TextEditor) => editorChanged(editor), null, ctx.subscriptions)
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => openTextDocument(doc))
    vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent) => changeTextDocument(event),
        null,
        ctx.subscriptions
    )

    vscode.languages.registerCompletionItemProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        await getCompletionProvider()
    )
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: COMMON_LISP_ID }, await getCompletionProvider())
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: REPL_ID }, await getCompletionProvider())

    vscode.languages.registerSignatureHelpProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getSigHelpProvider(), ' ')
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: COMMON_LISP_ID }, getSigHelpProvider(), ' ')
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: REPL_ID }, getSigHelpProvider(), ' ')

    vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider())

    vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        getDocumentFormatter()
    )
    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: COMMON_LISP_ID }, getDocumentFormatter())

    vscode.languages.registerDefinitionProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getDefinitionProvider())
    vscode.languages.registerDefinitionProvider({ scheme: 'file', language: COMMON_LISP_ID }, getDefinitionProvider())
    vscode.languages.registerDefinitionProvider({ scheme: 'file', language: REPL_ID }, getDefinitionProvider())

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
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inlineEval', inlineEval))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.clearInlineResults', clearInlineResults))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.attachRepl', attachRepl(ctx)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.detachRepl', detachRepl))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.replHistory', replHistory))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.debugAbort', debugAbort))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.nthRestart', nthRestart))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpand', macroExpand))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpandAll', macroExpandAll))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.disassemble', disassemble))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.loadFile', replLoadFile))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.systemSkeleton', systemSkeleton))

    if (activeEditor === undefined || !hasValidLangId(activeEditor.document)) {
        return
    }

    readLexTokens(activeEditor.document.fileName, activeEditor.document.getText())
    visibleEditorsChanged(vscode.window.visibleTextEditors)
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

async function pickFolder(folders: readonly vscode.WorkspaceFolder[]): Promise<vscode.WorkspaceFolder | undefined> {
    const nameMap: { [index: string]: vscode.WorkspaceFolder | undefined } = {}

    for (const folder of folders) {
        nameMap[folder.uri.fsPath] = folder
    }

    const pick = await vscode.window.showQuickPick(Object.keys(nameMap), { placeHolder: 'Select folder' })

    if (pick === undefined) {
        return undefined
    }

    return nameMap[pick]
}

async function systemSkeleton() {
    const folders = vscode.workspace.workspaceFolders

    if (folders === undefined) {
        vscode.window.showErrorMessage('No open folders')
        return
    }

    const folder = folders.length > 1 ? await pickFolder(folders) : folders[0]
    if (folder === undefined) {
        return
    }

    try {
        await Skeleton.create(folder)
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

function strToMarkdown(text: string): string {
    return text.replace(/ /g, '&nbsp;').replace(/\n/g, '  \n')
}

async function disassemble() {
    if (clRepl === undefined) {
        vscode.window.showInformationMessage(`REPL not connected`)
        return
    }

    const editor = vscode.window.activeTextEditor

    if (editor === undefined || !hasValidLangId(editor.document)) {
        return
    }

    try {
        const expr = await getTopExpr()
        if (expr === undefined || !(expr instanceof SExpr) || expr.parts.length < 2) {
            return
        }

        const name = exprToString(expr.parts[1])
        if (name === undefined) {
            return
        }

        const pkg = pkgMgr.getPackageForLine(editor.document.fileName, expr.start.line)
        const pkgName = pkg?.name ?? ':cl-user'
        const result = await clRepl.disassemble(`'${name}`, pkgName)

        if (result === undefined) {
            return
        }

        const file = await writeDisassemble(result)

        if (file !== undefined) {
            const editor = await vscode.window.showTextDocument(file, vscode.ViewColumn.Two, true)
            jumpToTop(editor)
        }
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

async function writeDisassemble(text: string) {
    const folder = await getTempFolder()

    if (folder === undefined) {
        vscode.window.showErrorMessage('No folder for disassemble output')
        return
    }

    await createFolder(folder)

    const filePath = vscode.Uri.joinPath(folder, 'disassemble.lisp')
    const file = await openFile(filePath)
    const content = new TextEncoder().encode(text)

    await vscode.workspace.fs.writeFile(file.uri, content)

    return file
}

async function macroExpand() {
    if (clRepl === undefined) {
        vscode.window.showInformationMessage(`REPL not connected`)
        return
    }

    const editor = vscode.window.activeTextEditor

    if (editor === undefined || !hasValidLangId(editor.document)) {
        return
    }

    try {
        const expr = await getInnerExpr(editor)
        if (expr === undefined) {
            return
        }

        const range = new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))
        const text = editor.document.getText(range)
        const pkg = pkgMgr.getPackageForLine(editor.document.fileName, range.start.line)
        const pkgName = pkg?.name ?? ':cl-user'
        const result = await clRepl.macroExpand(text, pkgName)

        if (result === undefined) {
            return
        }

        hoverText = strToMarkdown(result)
        vscode.commands.executeCommand('editor.action.showHover')
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

async function macroExpandAll() {
    if (clRepl === undefined) {
        vscode.window.showInformationMessage(`REPL not connected`)
        return
    }

    const editor = vscode.window.activeTextEditor

    if (editor === undefined || !hasValidLangId(editor.document)) {
        return
    }

    try {
        const expr = await getInnerExpr(editor)
        if (expr === undefined) {
            return
        }

        const range = new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))
        const text = editor.document.getText(range)
        const pkg = pkgMgr.getPackageForLine(editor.document.fileName, range.start.line)
        const pkgName = pkg?.name ?? ':cl-user'
        const result = await clRepl.macroExpandAll(text, pkgName)

        if (result === undefined) {
            return
        }

        hoverText = strToMarkdown(result)
        vscode.commands.executeCommand('editor.action.showHover')
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

async function replLoadFile() {
    if (clRepl === undefined) {
        vscode.window.showInformationMessage(`REPL not connected`)
        return
    }

    const editor = vscode.window.activeTextEditor
    if (editor === undefined || editor.document.languageId !== COMMON_LISP_ID) {
        vscode.window.showInformationMessage(`Not a Lisp file`)
        return
    }

    await editor.document.save()
    await clRepl.loadFile(editor.document.uri.fsPath)
    await updatePackageNames()
}

async function replHistory() {
    const items: repl.HistoryItem[] = []

    for (let ndx = clReplHistory.list.length - 1; ndx >= 0; ndx -= 1) {
        const item = clReplHistory.list[ndx]

        items.push(item)
    }

    const qp = vscode.window.createQuickPick()

    qp.items = items.map<vscode.QuickPickItem>((i) => ({ label: i.text, description: i.pkgName }))

    qp.onDidChangeSelection(async (e) => {
        const item = e[0]

        if (item === undefined) {
            return
        }

        const text = item.label
        const pkg = item.description
        const editor = vscode.window.activeTextEditor

        if (clRepl === undefined || editor === undefined) {
            return
        }

        await clRepl.send(editor, text, pkg ?? ':cl-user')
        clReplHistory.add(text, pkg ?? ':cl-user')
    })

    qp.onDidHide(() => qp.dispose())
    qp.show()
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
            await updatePackageNames()
        }
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

function getHoverProvider(): vscode.HoverProvider {
    return {
        async provideHover(
            doc: vscode.TextDocument,
            pos: vscode.Position,
            token: vscode.CancellationToken
        ): Promise<vscode.Hover> {
            return new vscode.Hover(hoverText)
        },
    }
}

function semTokensProvider(): vscode.DocumentSemanticTokensProvider {
    return {
        async provideDocumentSemanticTokens(
            doc: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.SemanticTokens> {
            const colorizer = new Colorizer(clRepl)
            const tokens = getLexTokens(doc.fileName)
            const emptyTokens = new vscode.SemanticTokens(new Uint32Array(0))

            if (tokens === undefined || tokens.length === 0) {
                return emptyTokens
            }

            try {
                const exprs = getDocumentExprs(doc)

                await updatePkgMgr(doc, exprs)

                return await colorizer.run(tokens)
            } catch (err) {
                vscode.window.showErrorMessage(format(err))
            }

            return emptyTokens
        },
    }
}

async function updatePkgMgr(doc: vscode.TextDocument | undefined, exprs: Expr[]) {
    if (doc?.languageId !== COMMON_LISP_ID) {
        return
    }

    await pkgMgr.update(clRepl, doc, exprs)
}

function debugAbort() {
    if (clRepl !== undefined) {
        clRepl.abort()
    }
}

async function editorChanged(editor?: vscode.TextEditor) {
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

    await updatePkgMgr(editor.document, exprs)
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

    clearInlineResults()
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

async function detachRepl() {
    if (clRepl === undefined) {
        return
    }

    await clRepl.disconnect()
    clRepl = undefined

    vscode.window.showInformationMessage('Disconnected from REPL')
}

function attachRepl(ctx: vscode.ExtensionContext): () => void {
    return async () => {
        try {
            const showMsgs = clRepl === undefined

            if (showMsgs) {
                vscode.window.showInformationMessage('Connecting to REPL')
            }

            await newReplConnection(ctx)

            if (showMsgs) {
                vscode.window.showInformationMessage('REPL Connected')
            }
        } catch (err) {
            vscode.window.showErrorMessage(format(err))
        }
    }
}

async function newReplConnection(ctx: vscode.ExtensionContext) {
    if (clRepl === undefined) {
        clRepl = new repl.Repl(ctx, 'localhost', 4005)
        clRepl.on('close', () => (clRepl = undefined))
    }

    await clRepl.connect()
    await updatePackageNames()
}

async function updatePackageNames() {
    if (clRepl === undefined) {
        return
    }

    const pkgs = await clRepl.getPackageNames()

    for (const pkg of pkgs) {
        pkgMgr.addPackage(pkg)
    }
}

function getExprRange(editor: vscode.TextEditor, expr: Expr): vscode.Range {
    const selection = editor.selection

    if (!selection.isEmpty) {
        return new vscode.Range(selection.start, selection.end)
    }

    return new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))
}

async function inlineEval() {
    if (clRepl === undefined) {
        vscode.window.showErrorMessage('REPL not connected')
        return
    }

    const editor = vscode.window.activeTextEditor
    const expr = await getInnerExpr(editor)

    if (editor?.document.languageId !== COMMON_LISP_ID || expr === undefined) {
        return
    }

    const range = getExprRange(editor, expr)
    const text = editor.document.getText(range)
    const pkg = pkgMgr.getPackageForLine(editor.document.fileName, range.start.line)
    const pkgName = pkg?.name ?? ':cl-user'
    const result = await clRepl.inlineEval(text, pkgName)

    if (result === undefined) {
        return
    }

    hoverText = strToMarkdown(result)
    vscode.commands.executeCommand('editor.action.showHover')
}

function clearInlineResults() {
    const editor = vscode.window.activeTextEditor
    if (editor?.document.languageId !== COMMON_LISP_ID) {
        return
    }

    hoverText = ''
}

async function getInnerExpr(editor: vscode.TextEditor | undefined): Promise<Expr | undefined> {
    if (editor === undefined) {
        return undefined
    }

    const exprs = getDocumentExprs(editor.document)

    await updatePkgMgr(editor.document, exprs)

    const pos = editor.selection.start
    let expr = findInnerExpr(exprs, pos)

    if (expr !== undefined) {
        return expr
    }

    return findAtom(exprs, pos)
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

        const expr = await getTopExpr()
        if (editor === undefined || expr === undefined) {
            return
        }

        const range = getExprRange(editor, expr)
        const text = editor.document.getText(range)
        const pkg = pkgMgr.getPackageForLine(editor.document.fileName, expr.start.line)
        const pkgName = editor.document.languageId === REPL_ID ? clRepl.curPackage : pkg?.name

        await clRepl.send(editor, text, pkgName ?? ':cl-user')

        if (editor.document.languageId === REPL_ID) {
            clReplHistory.add(text, pkgName ?? ':cl-user')
        }

        await updatePackageNames()
    } catch (err) {
        console.log(err)
    }
}

async function selectSexpr() {
    try {
        const editor = vscode.window.activeTextEditor
        if (editor === undefined || !hasValidLangId(editor.document)) {
            return
        }

        const expr = await getTopExpr()

        if (expr !== undefined) {
            editor.selection = new vscode.Selection(toVscodePos(expr.start), toVscodePos(expr.end))
        }
    } catch (err) {
        console.log(err)
    }
}

async function getTopExpr() {
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

        await updatePkgMgr(editor.document, exprs)

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
            const pkg = pkgMgr.getPackageForLine(document.fileName, pos.line)

            if (pkg === undefined) {
                return new vscode.SignatureHelp()
            }

            return await getHelp(clRepl, document, pos, pkg.name)
        },
    }
}

async function getCompletionProvider(): Promise<vscode.CompletionItemProvider> {
    return {
        async provideCompletionItems(
            document: vscode.TextDocument,
            pos: vscode.Position,
            token: vscode.CancellationToken,
            ctx: vscode.CompletionContext
        ) {
            try {
                const exprs = getDocumentExprs(document)

                await updatePkgMgr(document, exprs)

                const pkg = pkgMgr.getPackageForLine(document.fileName, pos.line)
                const atom = findAtom(exprs, pos)
                const textStr = atom !== undefined ? exprToString(atom) : undefined
                let pkgName = pkg?.name

                if (textStr !== undefined) {
                    const ndx = textStr.indexOf(':')

                    if (ndx > 0) {
                        pkgName = textStr.substr(0, ndx)
                    }
                }

                if (pkgName === undefined) {
                    return []
                }

                return await completionProvider.getCompletions(clRepl, exprs, pos, pkgName)
            } catch (err) {
                vscode.window.showErrorMessage(format(err))
                return []
            }
        },
    }
}

function getDocumentFormatter(): vscode.DocumentFormattingEditProvider {
    return {
        provideDocumentFormattingEdits(doc: vscode.TextDocument, opts: vscode.FormattingOptions) {
            const lex = new Lexer(doc.getText())
            const tokens = lex.getTokens()
            const formatter = new fmt.Formatter(readFormatterOptions(), tokens)
            const edits = formatter.format()

            return edits.length > 0 ? edits : undefined
        },
    }
}

function getDefinitionProvider(): vscode.DefinitionProvider {
    return {
        async provideDefinition(doc: vscode.TextDocument, pos: vscode.Position, token: vscode.CancellationToken) {
            try {
                const provider = new DefinitionProvider()
                const exprs = getDocumentExprs(doc)

                await updatePkgMgr(doc, exprs)

                const pkg = pkgMgr.getPackageForLine(doc.fileName, pos.line)

                if (clRepl !== undefined && pkg !== undefined) {
                    return await provider.getDefinitions(clRepl, pkg.name, exprs, pos)
                } else {
                    return []
                }
            } catch (err) {
                vscode.window.showErrorMessage(format(err))
                return []
            }
        },
    }
}

function readFormatterOptions(): fmt.Options {
    const cfg = vscode.workspace.getConfiguration('alive')
    const defaults: fmt.Options = {
        indentWidth: 2,
        closeParenOwnLine: 'never',
        closeParenStacked: 'always',
        indentCloseParenStack: true,
    }

    if (cfg?.format === undefined) {
        return defaults
    }

    const indentWidth = cfg.format.indentWidth ?? defaults.indentWidth

    const indentCloseParenStack = cfg.format.indentCloseParenStack ?? defaults.indentCloseParenStack
    const closeParenStacked = cfg.format.closeParenStacked ?? defaults.closeParenStacked
    const closeParenOwnLine = cfg.format.closeParenOwnLine ?? defaults.closeParenOwnLine

    return {
        indentWidth,
        indentCloseParenStack,
        closeParenStacked,
        closeParenOwnLine,
    }
}
