import * as vscode from 'vscode'
import { getLexTokens, Parser, readLexTokens } from './lisp'
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
    getSigHelpProvider,
} from './vscode/providers'
import { ExtensionState } from './vscode/Types'
import { COMMON_LISP_ID, hasValidLangId, REPL_ID, updatePkgMgr, useEditor } from './vscode/Utils'

const legend = new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend)
const state: ExtensionState = {
    repl: undefined,
    pkgMgr: new PackageMgr(),
    hoverText: '',
}

export const activate = async (ctx: vscode.ExtensionContext) => {
    vscode.window.onDidChangeVisibleTextEditors((editors: vscode.TextEditor[]) => visibleEditorsChanged(editors))
    vscode.window.onDidChangeActiveTextEditor((editor?: vscode.TextEditor) => editorChanged(editor), null, ctx.subscriptions)
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => openTextDocument(doc))
    vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent) => changeTextDocument(event),
        null,
        ctx.subscriptions
    )
    vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => saveTextDocument(doc))

    vscode.languages.registerCompletionItemProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        await getCompletionProvider(state)
    )
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: COMMON_LISP_ID }, getCompletionProvider(state))
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: REPL_ID }, getCompletionProvider(state))

    vscode.languages.registerSignatureHelpProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        getSigHelpProvider(state),
        ' '
    )
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: COMMON_LISP_ID }, getSigHelpProvider(state), ' ')
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: REPL_ID }, getSigHelpProvider(state), ' ')

    vscode.languages.registerRenameProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getRenameProvider(state))
    vscode.languages.registerRenameProvider({ scheme: 'file', language: COMMON_LISP_ID }, getRenameProvider(state))

    vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider(state))

    vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        getDocumentFormatter(state)
    )
    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: COMMON_LISP_ID }, getDocumentFormatter(state))

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
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.attachRepl', () => cmds.attachRepl(state, ctx)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.detachRepl', () => cmds.detachRepl(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.replHistory', () => cmds.replHistory(state, false)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.replHistoryDoNotEval', () => cmds.replHistory(state, true)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.debugAbort', () => cmds.debugAbort(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.nthRestart', (n: unknown) => cmds.nthRestart(state, n)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpand', () => cmds.macroExpand(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpandAll', () => cmds.macroExpandAll(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.disassemble', () => cmds.disassemble(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(state)))
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

async function saveTextDocument(doc: vscode.TextDocument) {
    if (doc.languageId !== COMMON_LISP_ID || state.repl === undefined) {
        return
    }

    const cfg = vscode.workspace.getConfiguration('alive')

    if (cfg.autoLoadOnSave) {
        await state.repl.loadFile(doc.fileName, false)
    }
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

    await updatePkgMgr(state, editor.document, exprs)
}

function openTextDocument(doc: vscode.TextDocument) {
    if (!hasValidLangId(doc, [COMMON_LISP_ID, REPL_ID])) {
        return
    }

    readLexTokens(doc.fileName, doc.getText())
}

function changeTextDocument(event: vscode.TextDocumentChangeEvent) {
    if (!hasValidLangId(event.document, [COMMON_LISP_ID, REPL_ID])) {
        return
    }

    cmds.clearInlineResults(state)
    readLexTokens(event.document.fileName, event.document.getText())

    const editor = findEditorForDoc(event.document)

    if (editor?.document.languageId !== REPL_ID) {
        return
    }

    for (const change of event.contentChanges) {
        if (change.range === undefined) {
            continue
        }

        if (editor.document.languageId === REPL_ID) {
            state.repl?.documentChanged()
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
