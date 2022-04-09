import * as vscode from 'vscode'
import { readLexTokens } from './lisp'
import { Swank } from './vscode/backend/Swank'
import { tokenModifiersLegend, tokenTypesLegend } from './vscode/colorize'
import * as cmds from './vscode/commands'
import { PackageMgr } from './vscode/PackageMgr'
import { getFoldProvider, getHoverProvider, getRenameProvider, LispTreeProvider } from './vscode/providers'
import { ExtensionState, LocalBackend, SwankBackendState } from './vscode/Types'
import { COMMON_LISP_ID, hasValidLangId, REPL_ID, startCompileTimer, useEditor } from './vscode/Utils'
import { LSP } from './vscode/backend/LSP'
import { LispRepl } from './vscode/providers/LispRepl'

const BACKEND_TYPE_SWANK = 'Swank'
const BACKEND_TYPE_LSP = 'LSP'
const DEFAULT_LSP_PORT = 25483
const DEFAULT_LSP_HOST = '127.0.0.1'

const legend = new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend)
let state: ExtensionState = { hoverText: '', compileRunning: false, compileTimeoutID: undefined }
let backendType = BACKEND_TYPE_SWANK

export const activate = async (ctx: vscode.ExtensionContext) => {
    backendType = BACKEND_TYPE_LSP

    if (backendType === BACKEND_TYPE_LSP) {
        const backend = new LSP({ extState: state })

        await backend.connect({ host: DEFAULT_LSP_HOST, port: DEFAULT_LSP_PORT })

        state.backend = backend

        const activeDoc = vscode.window.activeTextEditor?.document

        if (activeDoc !== undefined && hasValidLangId(activeDoc, [COMMON_LISP_ID])) {
            backend.editorChanged(vscode.window.activeTextEditor)
        }

        vscode.window.registerTreeDataProvider('lispPackages', new LispTreeProvider())
        vscode.window.registerTreeDataProvider('lispThreads', new LispTreeProvider())
        vscode.window.registerWebviewViewProvider('lispRepl', new LispRepl(ctx))

        ctx.subscriptions.push(
            vscode.commands.registerCommand('alive.selectSexpr', () => backend.selectSexpr(vscode.window.activeTextEditor))
        )
    } else if (backendType === BACKEND_TYPE_SWANK) {
        const swankState: SwankBackendState = {
            ctx,
            extState: state,
            repl: undefined,
            pkgMgr: new PackageMgr(),
        }

        state.backend = new Swank(swankState)

        const backend = state.backend as LocalBackend

        // vscode.window.onDidChangeVisibleTextEditors((editors: vscode.TextEditor[]) => visibleEditorsChanged(editors))
        vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => backend.textDocumentSaved(doc))

        if (state.backend !== undefined) {
            vscode.languages.registerCompletionItemProvider(
                { scheme: 'untitled', language: COMMON_LISP_ID },
                backend.getCompletionProvider()
            )
            vscode.languages.registerCompletionItemProvider(
                { scheme: 'file', language: COMMON_LISP_ID },
                backend.getCompletionProvider()
            )
            vscode.languages.registerCompletionItemProvider(
                { scheme: 'file', language: REPL_ID },
                backend.getCompletionProvider()
            )

            vscode.languages.registerDocumentFormattingEditProvider(
                { scheme: 'untitled', language: COMMON_LISP_ID },
                backend.getFormatProvider()
            )
            vscode.languages.registerDocumentFormattingEditProvider(
                { scheme: 'file', language: COMMON_LISP_ID },
                backend.getFormatProvider()
            )

            vscode.languages.registerDocumentSemanticTokensProvider(
                { scheme: 'untitled', language: COMMON_LISP_ID },
                backend.getSemTokensProvider(),
                legend
            )
            vscode.languages.registerDocumentSemanticTokensProvider(
                { scheme: 'file', language: COMMON_LISP_ID },
                backend.getSemTokensProvider(),
                legend
            )
            vscode.languages.registerDocumentSemanticTokensProvider(
                { scheme: 'file', language: REPL_ID },
                backend.getSemTokensProvider(),
                legend
            )

            vscode.languages.registerDefinitionProvider(
                { scheme: 'untitled', language: COMMON_LISP_ID },
                backend.getDefinitionProvider()
            )
            vscode.languages.registerDefinitionProvider(
                { scheme: 'file', language: COMMON_LISP_ID },
                backend.getDefinitionProvider()
            )
            vscode.languages.registerDefinitionProvider({ scheme: 'file', language: REPL_ID }, backend.getDefinitionProvider())
        }

        vscode.languages.registerRenameProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getRenameProvider(state))
        vscode.languages.registerRenameProvider({ scheme: 'file', language: COMMON_LISP_ID }, getRenameProvider(state))

        vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider(state))

        vscode.languages.registerFoldingRangeProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getFoldProvider(state))
        vscode.languages.registerFoldingRangeProvider({ scheme: 'file', language: COMMON_LISP_ID }, getFoldProvider(state))

        ctx.subscriptions.push(vscode.commands.registerCommand('alive.attachRepl', () => cmds.attachRepl(state)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.detachRepl', () => cmds.detachRepl(state)))

        ctx.subscriptions.push(vscode.commands.registerCommand('alive.selectSexpr', () => cmds.selectSexpr()))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.sendToRepl', () => cmds.sendToRepl(state)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.inlineEval', () => cmds.inlineEval(state)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.clearInlineResults', () => cmds.clearInlineResults(state)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.startReplAndAttach', () => cmds.startReplAndAttach(state)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.replHistory', () => cmds.sendReplHistoryItem(state)))
        ctx.subscriptions.push(
            vscode.commands.registerCommand('alive.replHistoryDoNotEval', () => cmds.grabReplHistoryItem(state))
        )
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.debugAbort', () => cmds.debugAbort(state)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.nthRestart', (n: unknown) => cmds.nthRestart(state, n)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpand', () => cmds.macroExpand(state)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpandAll', () => cmds.macroExpandAll(state)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.disassemble', () => cmds.disassemble(state)))
        ctx.subscriptions.push(vscode.commands.registerCommand('alive.compileFile', () => cmds.compileFile(state, false)))
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
            // visibleEditorsChanged(vscode.window.visibleTextEditors)
        })
    }

    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => openTextDocument(doc))

    vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent) => state.backend?.textDocumentChanged(event),
        null,
        ctx.subscriptions
    )

    vscode.window.onDidChangeActiveTextEditor(
        (editor?: vscode.TextEditor) => state.backend?.editorChanged(editor),
        null,
        ctx.subscriptions
    )

    ctx.subscriptions.push(vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(state)))
}

function visibleEditorsChanged(editors: vscode.TextEditor[]) {
    for (const editor of editors) {
        if (hasValidLangId(editor.document, [COMMON_LISP_ID, REPL_ID])) {
            readLexTokens(editor.document.fileName, editor.document.getText())
        }
    }
}

function openTextDocument(doc: vscode.TextDocument) {
    if (!hasValidLangId(doc, [COMMON_LISP_ID, REPL_ID])) {
        return
    }

    startCompileTimer(state)

    readLexTokens(doc.fileName, doc.getText())
}
