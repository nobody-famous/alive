import * as vscode from 'vscode'
import { getLexTokens, Parser, readLexTokens } from './lisp'
import { Swank } from './vscode/backend/Swank'
import { tokenModifiersLegend, tokenTypesLegend } from './vscode/colorize'
import * as cmds from './vscode/commands'
import { PackageMgr } from './vscode/PackageMgr'
import {
    getCompletionProvider,
    getDefinitionProvider,
    getDocumentFormatter,
    getFoldProvider,
    getHoverProvider,
    getRenameProvider,
    getSemTokensProvider,
} from './vscode/providers'
import { Backend, ExtensionState, SwankBackendState } from './vscode/Types'
import { COMMON_LISP_ID, hasValidLangId, REPL_ID, updatePkgMgr, useEditor } from './vscode/Utils'

const legend = new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend)
let state: ExtensionState = { hoverText: '', compileRunning: false }
let backend: Backend | undefined = undefined

let compileTimeoutID: NodeJS.Timeout | undefined = undefined

export const activate = async (ctx: vscode.ExtensionContext) => {
    const swankState: SwankBackendState = { repl: undefined, pkgMgr: new PackageMgr(), hoverText: '', compileRunning: false }

    backend = new Swank(swankState)

    vscode.window.onDidChangeVisibleTextEditors((editors: vscode.TextEditor[]) => visibleEditorsChanged(editors))
    vscode.window.onDidChangeActiveTextEditor((editor?: vscode.TextEditor) => editorChanged(editor), null, ctx.subscriptions)
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => openTextDocument(doc))
    vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent) => backend?.changeTextDocument(event),
        null,
        ctx.subscriptions
    )
    vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => backend?.saveTextDocument(doc))

    vscode.languages.registerCompletionItemProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        getCompletionProvider(state)
    )
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: COMMON_LISP_ID }, getCompletionProvider(state))
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: REPL_ID }, getCompletionProvider(state))

    vscode.languages.registerRenameProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getRenameProvider(state))
    vscode.languages.registerRenameProvider({ scheme: 'file', language: COMMON_LISP_ID }, getRenameProvider(state))

    vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider(state))

    vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        getDocumentFormatter(state)
    )
    vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: COMMON_LISP_ID },
        getDocumentFormatter(state)
    )

    vscode.languages.registerDefinitionProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getDefinitionProvider(state))
    vscode.languages.registerDefinitionProvider({ scheme: 'file', language: COMMON_LISP_ID }, getDefinitionProvider(state))
    vscode.languages.registerDefinitionProvider({ scheme: 'file', language: REPL_ID }, getDefinitionProvider(state))

    vscode.languages.registerDocumentSemanticTokensProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        getSemTokensProvider(state),
        legend
    )
    vscode.languages.registerDocumentSemanticTokensProvider(
        { scheme: 'file', language: COMMON_LISP_ID },
        getSemTokensProvider(state),
        legend
    )
    vscode.languages.registerDocumentSemanticTokensProvider(
        { scheme: 'file', language: REPL_ID },
        getSemTokensProvider(state),
        legend
    )

    vscode.languages.registerFoldingRangeProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getFoldProvider(state))
    vscode.languages.registerFoldingRangeProvider({ scheme: 'file', language: COMMON_LISP_ID }, getFoldProvider(state))

    ctx.subscriptions.push(vscode.commands.registerCommand('alive.selectSexpr', () => cmds.selectSexpr()))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.sendToRepl', () => cmds.sendToRepl(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inlineEval', () => cmds.inlineEval(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.clearInlineResults', () => cmds.clearInlineResults(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.startReplAndAttach', () => cmds.startReplAndAttach(state, ctx)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.attachRepl', () => cmds.attachRepl(state, ctx)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.detachRepl', () => cmds.detachRepl(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.replHistory', () => cmds.replHistory(state, false)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.replHistoryDoNotEval', () => cmds.replHistory(state, true)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.debugAbort', () => cmds.debugAbort(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.nthRestart', (n: unknown) => cmds.nthRestart(state, n)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpand', () => cmds.macroExpand(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpandAll', () => cmds.macroExpandAll(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.disassemble', () => cmds.disassemble(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.compileFile', () => cmds.compileFile(state, false)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.loadAsdfSystem', () => cmds.loadAsdfSystem(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.compileAsdfSystem', () => cmds.compileAsdfSystem(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector', () => cmds.inspector(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector-prev', () => cmds.inspectorPrev(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector-next', () => cmds.inspectorNext(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector-refresh', () => cmds.inspectorRefresh(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector-quit', () => cmds.inspectorQuit(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.systemSkeleton', () => cmds.systemSkeleton()))

    useEditor([COMMON_LISP_ID, REPL_ID], (editor: vscode.TextEditor) => {
        readLexTokens(editor.document.fileName, editor.document.getText())
        visibleEditorsChanged(vscode.window.visibleTextEditors)
    })
}

function visibleEditorsChanged(editors: vscode.TextEditor[]) {
    for (const editor of editors) {
        if (hasValidLangId(editor.document, [COMMON_LISP_ID, REPL_ID])) {
            readLexTokens(editor.document.fileName, editor.document.getText())
        }
    }
}

async function editorChanged(editor?: vscode.TextEditor) {
    if (editor === undefined || !hasValidLangId(editor.document, [COMMON_LISP_ID, REPL_ID])) {
        return
    }

    let tokens = getLexTokens(editor.document.fileName)
    if (tokens === undefined) {
        tokens = readLexTokens(editor.document.fileName, editor.document.getText())
    }

    const parser = new Parser(getLexTokens(editor.document.fileName) ?? [])
    const exprs = parser.parse()

    startCompileTimer()

    await updatePkgMgr(state, editor.document, exprs)
}

function openTextDocument(doc: vscode.TextDocument) {
    if (!hasValidLangId(doc, [COMMON_LISP_ID, REPL_ID])) {
        return
    }

    readLexTokens(doc.fileName, doc.getText())
}

function startCompileTimer() {
    const cfg = vscode.workspace.getConfiguration('alive')
    const autoCompile = cfg.autoCompileOnType

    if (!backend?.isConnected() || !autoCompile) {
        return
    }

    if (compileTimeoutID !== undefined) {
        clearTimeout(compileTimeoutID)
        compileTimeoutID = undefined
    }

    compileTimeoutID = setTimeout(() => cmds.compileFile(state, true, true), 500)
}
