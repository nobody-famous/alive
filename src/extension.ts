import * as vscode from 'vscode'
import * as cmds from './vscode/commands'
import * as path from 'path'
import { promises as fs } from 'fs'
import { PackageNode, ExportNode, ThreadNode } from './vscode/providers'
import { ExtensionDeps, ExtensionState, HistoryItem } from './vscode/Types'
import { COMMON_LISP_ID, getWorkspacePath, hasValidLangId, startCompileTimer } from './vscode/Utils'
import { LSP } from './vscode/backend/LSP'
import { downloadLspServer, startLspServer } from './vscode/backend/LspProcess'
import { HistoryNode } from './vscode/providers/ReplHistory'
import { UI } from './vscode/UI'
import { log, toLog } from './vscode/Log'

export const activate = async (ctx: vscode.ExtensionContext) => {
    log(`Activating extension`)

    const workspacePath = await getWorkspacePath()

    log(`Workspace Path: ${toLog(workspacePath)}`)

    const state: ExtensionState = {
        hoverText: '',
        compileRunning: false,
        compileTimeoutID: undefined,
        historyNdx: -1,
        ctx,
        replHistoryFile:
            workspacePath !== undefined ? path.join(workspacePath, '.vscode', 'alive', 'repl-history.json') : 'repl-history.json',
    }

    const deps: ExtensionDeps = {
        ui: new UI(state),
        lsp: new LSP(state),
    }

    try {
        state.lspInstallPath = await downloadLspServer()
        log(`LSP install path: ${toLog(state.lspInstallPath)}`)
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to download LSP server: ${err}`)
        return
    }

    const port = await startLspServer(state)

    log(`Server port ${toLog(port)}`)

    const history = await readReplHistory(state.replHistoryFile)

    initUI(deps, state)
    initLSP(deps, state)

    await deps.lsp.connect({ host: '127.0.0.1', port })
    await initTreeViews(deps, history)

    const activeDoc = vscode.window.activeTextEditor?.document

    if (activeDoc !== undefined && hasValidLangId(activeDoc, [COMMON_LISP_ID])) {
        deps.lsp.editorChanged(vscode.window.activeTextEditor)
    }

    ctx.subscriptions.push(
        vscode.commands.registerCommand('alive.selectSexpr', () => cmds.selectSexpr(deps)),
        vscode.commands.registerCommand('alive.sendToRepl', () => cmds.sendToRepl(deps)),
        vscode.commands.registerCommand('alive.loadAsdfSystem', () => cmds.loadAsdfSystem(deps)),

        vscode.commands.registerCommand('alive.refreshPackages', async () => cmds.refreshPackages(deps)),

        vscode.commands.registerCommand('alive.refreshAsdfSystems', () => cmds.refreshAsdfSystems(deps)),
        vscode.commands.registerCommand('alive.refreshThreads', () => cmds.refreshThreads(deps)),
        vscode.commands.registerCommand('alive.clearRepl', () => cmds.clearRepl(deps)),
        vscode.commands.registerCommand('alive.clearInlineResults', () => cmds.clearInlineResults(state)),
        vscode.commands.registerCommand('alive.inlineEval', () => cmds.inlineEval(deps, state)),
        vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(deps)),

        vscode.commands.registerCommand('alive.replHistory', async () => {
            const item = await deps.ui.selectHistoryItem()

            await saveReplHistory(state.replHistoryFile, deps.ui.getHistoryItems())

            deps.lsp.eval(item.text, item.pkgName)
        }),

        vscode.commands.registerCommand('alive.clearReplHistory', () => {
            deps.ui.clearReplHistory()

            saveReplHistory(state.replHistoryFile, [])
        }),

        vscode.commands.registerCommand('alive.removePackage', (node) => {
            if (!(node instanceof PackageNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            deps.lsp.removePackage(node.label)
        }),
        vscode.commands.registerCommand('alive.removeExport', (node) => {
            if (!(node instanceof ExportNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            deps.lsp.removeExport(node.pkg, node.label)
        }),
        vscode.commands.registerCommand('alive.loadAsdfByName', async (node) => {
            if (typeof node.label !== 'string' || node.label === '') {
                return
            }

            deps.ui.addReplText(`Loading ASDF System ${node.label}`)

            await deps.lsp.loadAsdfSystem(node.label)

            deps.ui.addReplText(`Done Loading ASDF System ${node.label}`)
        }),
        vscode.commands.registerCommand('alive.killThread', (node) => {
            if (!(node instanceof ThreadNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            deps.lsp.killThread(node.thread)
        }),
        vscode.commands.registerCommand('alive.evalHistory', (node) => {
            if (!(node instanceof HistoryNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            deps.ui.moveHistoryNodeToTop(node)
            deps.lsp.eval(node.item.text, node.item.pkgName)
        }),
        vscode.commands.registerCommand('alive.editHistory', (node) => {
            if (!(node instanceof HistoryNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            deps.ui.setReplPackage(node.item.pkgName)
            deps.ui.setReplInput(node.item.text)
        }),
        vscode.commands.registerCommand('alive.removeHistory', (node) => {
            if (!(node instanceof HistoryNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            deps.ui.removeHistoryNode(node)

            saveReplHistory(state.replHistoryFile, deps.ui.getHistoryItems())
        })
    )

    setWorkspaceEventHandlers(deps, state)

    await vscode.commands.executeCommand('replHistory.focus')
    await vscode.commands.executeCommand('lispRepl.focus')

    if (activeDoc !== undefined) {
        vscode.window.showTextDocument(activeDoc)
    }
}

function setWorkspaceEventHandlers(deps: ExtensionDeps, state: ExtensionState) {
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => openTextDocument(deps, state, doc))

    vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent) => deps.lsp.textDocumentChanged(event),
        null,
        state.ctx.subscriptions
    )

    vscode.window.onDidChangeActiveTextEditor(
        (editor?: vscode.TextEditor) => deps.lsp.editorChanged(editor),
        null,
        state.ctx.subscriptions
    )
}

async function saveReplHistory(fileName: string, items: HistoryItem[]): Promise<void> {
    await fs.writeFile(fileName, JSON.stringify(items))
}

async function readReplHistory(fileName: string): Promise<HistoryItem[]> {
    try {
        const content = await fs.readFile(fileName)
        const data = JSON.parse(content.toString())

        if (!Array.isArray(data)) {
            return []
        }

        const history: HistoryItem[] = []

        for (const item of data) {
            if (item.pkgName === undefined || item.text === undefined) {
                continue
            }

            history.push(item)
        }

        return history
    } catch (err) {
        return []
    }
}

function openTextDocument(deps: ExtensionDeps, state: ExtensionState, doc: vscode.TextDocument) {
    if (!hasValidLangId(doc, [COMMON_LISP_ID])) {
        return
    }

    startCompileTimer(deps, state)
}

async function initTreeViews(deps: ExtensionDeps, history: HistoryItem[]) {
    const pkgs = await deps.lsp.listPackages()
    const systems = await deps.lsp.listAsdfSystems()
    const threads = await deps.lsp.listThreads()

    deps.ui.initPackagesTree(pkgs)
    deps.ui.initHistoryTree(history)
    deps.ui.initAsdfSystemsTree(systems)
    deps.ui.initThreadsTree(threads)
}

function initUI(deps: ExtensionDeps, state: ExtensionState) {
    deps.ui.on('saveReplHistory', (items: HistoryItem[]) => saveReplHistory(state.replHistoryFile, items))
    deps.ui.on('listPackages', async (fn) => fn(await deps.lsp.listPackages()))
    deps.ui.on('eval', (text, pkgName, storeResult) => deps.lsp.eval(text, pkgName, storeResult))
}

function initLSP(deps: ExtensionDeps, state: ExtensionState) {
    deps.lsp.on('refreshPackages', () => cmds.refreshPackages(deps))
    deps.lsp.on('refreshThreads', () => cmds.refreshThreads(deps))
    deps.lsp.on('startCompileTimer', () => startCompileTimer(deps, state))
    deps.lsp.on('output', (str) => deps.ui.addReplText(str))
    deps.lsp.on('getRestartIndex', async (info, fn) => fn(await deps.ui.getRestartIndex(info)))
    deps.lsp.on('getUserInput', async (fn) => fn(await deps.ui.getUserInput()))
}
