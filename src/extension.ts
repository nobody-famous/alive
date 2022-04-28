import * as vscode from 'vscode'
import * as cmds from './vscode/commands'
import { ThreadsTreeProvider, PackagesTreeProvider, PackageNode, ExportNode, ThreadNode } from './vscode/providers'
import { ExtensionState } from './vscode/Types'
import { COMMON_LISP_ID, hasValidLangId, startCompileTimer } from './vscode/Utils'
import { LSP } from './vscode/backend/LSP'
import { LispRepl } from './vscode/providers/LispRepl'
import { AsdfSystemsTreeProvider } from './vscode/providers/AsdfSystemsTree'
import { startLspServer } from './vscode/backend/ChildProcess'

const DEFAULT_LSP_PORT = 25483
const DEFAULT_LSP_HOST = '127.0.0.1'

let state: ExtensionState = { hoverText: '', compileRunning: false, compileTimeoutID: undefined }

export const activate = async (ctx: vscode.ExtensionContext) => {
    const repl = new LispRepl(ctx)
    const backend = new LSP({ extState: state })

    repl.on('eval', async (pkg: string, text: string) => {
        await backend.eval(text, pkg)
    })

    repl.on('requestPackage', async () => {
        const pkgs = await backend.listPackages()
        const names: string[] = []

        for (const pkg of pkgs) {
            names.push(pkg.name.toLowerCase())

            for (const nick of pkg.nicknames) {
                names.push(nick.toLowerCase())
            }
        }

        const pick = await vscode.window.showQuickPick(names.sort(), { placeHolder: 'Select Package' })

        if (pick !== undefined) {
            repl.setPackage(pick)
        }
    })

    backend.on('output', (str) => repl.addText(str))

    state.backend = backend

    await startLspServer(state)
    await state.backend.connect({ host: DEFAULT_LSP_HOST, port: DEFAULT_LSP_PORT })

    const activeDoc = vscode.window.activeTextEditor?.document

    if (activeDoc !== undefined && hasValidLangId(activeDoc, [COMMON_LISP_ID])) {
        backend.editorChanged(vscode.window.activeTextEditor)
    }

    const pkgs = await backend.listPackages()
    const systems = await backend.listAsdfSystems()
    const threads = await backend.listThreads()

    state.packageTree = new PackagesTreeProvider(pkgs)
    state.asdfTree = new AsdfSystemsTreeProvider(systems)
    state.threadTree = new ThreadsTreeProvider(threads)

    vscode.window.registerTreeDataProvider('lispPackages', state.packageTree)
    vscode.window.registerTreeDataProvider('asdfSystems', state.asdfTree)
    vscode.window.registerTreeDataProvider('lispThreads', state.threadTree)
    vscode.window.registerWebviewViewProvider('lispRepl', repl)

    ctx.subscriptions.push(
        vscode.commands.registerCommand('alive.selectSexpr', () => backend.selectSexpr(vscode.window.activeTextEditor)),
        vscode.commands.registerCommand('alive.sendToRepl', () => backend.sendToRepl(vscode.window.activeTextEditor)),
        vscode.commands.registerCommand('alive.loadAsdfSystem', () => cmds.loadAsdfSystem(state)),
        vscode.commands.registerCommand('alive.refreshPackages', () => cmds.refreshPackages(state)),
        vscode.commands.registerCommand('alive.refreshAsdfSystems', () => cmds.refreshAsdfSystems(state)),
        vscode.commands.registerCommand('alive.refreshThreads', () => cmds.refreshThreads(state)),
        vscode.commands.registerCommand('alive.clearRepl', () => repl.clear()),
        vscode.commands.registerCommand('alive.clearInlineResults', () => cmds.clearInlineResults(state)),
        vscode.commands.registerCommand('alive.replHistory', () => cmds.sendReplHistoryItem(state)),
        vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(state)),

        // vscode.commands.registerCommand('alive.debugAbort', () => cmds.debugAbort(state)),
        // vscode.commands.registerCommand('alive.nthRestart', (n: unknown) => cmds.nthRestart(state, n)),
        // vscode.commands.registerCommand('alive.macroExpand', () => cmds.macroExpand(state)),
        // vscode.commands.registerCommand('alive.macroExpandAll', () => cmds.macroExpandAll(state)),
        // vscode.commands.registerCommand('alive.disassemble', () => cmds.disassemble(state)),
        // vscode.commands.registerCommand('alive.compileFile', () => cmds.compileFile(state, false)),
        // vscode.commands.registerCommand('alive.inspector', () => cmds.inspector(state)),
        // vscode.commands.registerCommand('alive.inspector-prev', () => cmds.inspectorPrev(state)),
        // vscode.commands.registerCommand('alive.inspector-next', () => cmds.inspectorNext(state)),
        // vscode.commands.registerCommand('alive.inspector-refresh', () => cmds.inspectorRefresh(state)),
        // vscode.commands.registerCommand('alive.inspector-quit', () => cmds.inspectorQuit(state)),
        // vscode.commands.registerCommand('alive.systemSkeleton', () => cmds.systemSkeleton()),

        vscode.commands.registerCommand('alive.removePackage', (node) => {
            if (!(node instanceof PackageNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            backend.removePackage(node.label)
        }),
        vscode.commands.registerCommand('alive.removeExport', (node) => {
            if (!(node instanceof ExportNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            backend.removeExport(node.pkg, node.label)
        }),
        vscode.commands.registerCommand('alive.loadAsdfByName', (node) => {
            if (typeof node.label !== 'string' || node.label === '') {
                return
            }

            backend.loadAsdfSystem(node.label)
        }),
        vscode.commands.registerCommand('alive.killThread', (node) => {
            if (!(node instanceof ThreadNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            backend.killThread(node.thread)
        })
    )

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

    await vscode.commands.executeCommand('lispPackages.focus')
    await vscode.commands.executeCommand('lispRepl.focus')

    if (activeDoc !== undefined) {
        vscode.window.showTextDocument(activeDoc)
    }
}

function openTextDocument(doc: vscode.TextDocument) {
    if (!hasValidLangId(doc, [COMMON_LISP_ID])) {
        return
    }

    startCompileTimer(state)
}
