import * as vscode from 'vscode'
import * as cmds from './vscode/commands'
import * as path from 'path'
import { promises as fs } from 'fs'
import { PackageNode, ExportNode } from './vscode/views/PackagesTree'
import { ThreadNode } from './vscode/views/ThreadsTree'
import { ExtensionDeps, ExtensionState, HistoryItem, InspectInfo, InspectResult } from './vscode/Types'
import {
    COMMON_LISP_ID,
    diagnosticsEnabled,
    getWorkspaceOrFilePath,
    hasValidLangId,
    startCompileTimer,
    tryCompile,
    updateDiagnostics,
} from './vscode/Utils'
import { LSP } from './vscode/backend/LSP'
import { downloadLspServer, startLspServer } from './vscode/backend/LspProcess'
import { HistoryNode } from './vscode/views/ReplHistory'
import { UI } from './vscode/UI'
import { log, toLog } from './vscode/Log'
import { getHoverProvider } from './vscode/providers/Hover'
import { initialize as initCfg } from './config'

// Word separator characters for CommonLisp.
// These determine how a double-click will extend over a symbol.
// Instead of defining what is contained in a symbol,
// VSCode defines what is NOT in a symbol (or whatever).
//
// Using current (2023-04-27) version of config item minus hyphen.
// Could also get() the default setting at load time and remove the hyphen
// but it seems like a good idea to take control of this configuration item
// in order to be independent of any future changes to the default setting.
const wordSeparators = '`|;:\'",()'

export const activate = async (ctx: Pick<vscode.ExtensionContext, 'subscriptions' | 'extensionPath'>) => {
    log('Activating extension')

    const aliveCfg = initCfg()
    const workspacePath = await getWorkspaceOrFilePath()

    log(`Workspace Path: ${toLog(workspacePath)}`)

    if (Array.isArray(vscode.workspace.workspaceFolders) && vscode.workspace.workspaceFolders.length > 0) {
        const editorConfig = vscode.workspace.getConfiguration('editor')
        await editorConfig.update('formatOnType', true, false, true)

        const lispConfig = vscode.workspace.getConfiguration('', { languageId: COMMON_LISP_ID })
        await lispConfig.update('editor.wordSeparators', wordSeparators, false, true)

        log(`Format On Type: ${editorConfig.get('formatOnType')}`)
    }

    const state: ExtensionState = {
        diagnostics: vscode.languages.createDiagnosticCollection('Compiler Diagnostics'),
        hoverText: '',
        compileRunning: false,
        compileTimeoutID: undefined,
        ctx,
        workspacePath,
        replHistoryFile:
            workspacePath !== undefined ? path.join(workspacePath, '.vscode', 'alive', 'repl-history.json') : 'repl-history.json',
    }

    const ui = new UI(state)

    ui.init()
    ui.registerProviders()

    const deps: ExtensionDeps = {
        ui: ui,
        lsp: new LSP(state),
    }

    const remoteCfg = { ...aliveCfg.lsp.remote }
    const useRemoteServer = remoteCfg.host !== null && remoteCfg.port !== null

    if (remoteCfg.host === null || remoteCfg.port === null) {
        // Download and connect to local server
    }

    if (useRemoteServer) {
        log(`Using remote server ${toLog(lspHost)} ${toLog(lspPort)}`)
    } else {
        try {
            state.lspInstallPath = await downloadLspServer()
            log(`LSP install path: ${toLog(state.lspInstallPath)}`)
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to download LSP server: ${err}`)
            return
        }

        lspHost = '127.0.0.1'
        lspPort = await startLspServer(state)
        log(`Server port ${toLog(lspPort)}`)
    }

    const history = await readReplHistory(state.replHistoryFile)

    initUI(deps, state)
    initLSP(deps, state)

    if (lspHost === undefined || lspPort === undefined) {
        vscode.window.showErrorMessage(`Cannot connect to ${lspHost}:${lspPort}`)
        return
    }

    await deps.lsp.connect({ host: lspHost, port: lspPort })
    await initTreeViews(deps, history)

    const activeDoc = vscode.window.activeTextEditor?.document

    if (activeDoc !== undefined && hasValidLangId(activeDoc, [COMMON_LISP_ID])) {
        deps.lsp.editorChanged(vscode.window.activeTextEditor)
    }

    ctx.subscriptions.push(
        vscode.commands.registerCommand('alive.selectSexpr', () => cmds.selectSexpr(deps)),
        vscode.commands.registerCommand('alive.sendToRepl', () => cmds.sendToRepl(deps)),
        vscode.commands.registerCommand('alive.loadAsdfSystem', () => cmds.loadAsdfSystem(deps)),
        vscode.commands.registerCommand('alive.compileFile', () => cmds.compileFile(deps, state)),

        vscode.commands.registerCommand('alive.refreshPackages', async () => cmds.refreshPackages(deps)),

        vscode.commands.registerCommand('alive.refreshAsdfSystems', () => cmds.refreshAsdfSystems(deps)),
        vscode.commands.registerCommand('alive.refreshThreads', () => cmds.refreshThreads(deps)),
        vscode.commands.registerCommand('alive.clearRepl', () => cmds.clearRepl(deps)),
        vscode.commands.registerCommand('alive.clearInlineResults', () => cmds.clearInlineResults(state)),
        vscode.commands.registerCommand('alive.inlineEval', () => cmds.inlineEval(deps, state)),
        vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(deps)),
        vscode.commands.registerCommand('alive.inspect', (symbol) => cmds.inspect(deps, symbol)),
        vscode.commands.registerCommand('alive.inspectMacro', () => cmds.inspectMacro(deps)),
        vscode.commands.registerCommand('alive.openScratchPad', () => cmds.openScratchPad(state)),
        vscode.commands.registerCommand('alive.macroexpand', () => cmds.macroexpand(deps)),
        vscode.commands.registerCommand('alive.macroexpand1', () => cmds.macroexpand1(deps)),

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

            await vscode.workspace.saveAll()

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

    vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider(state, deps.lsp))

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

    if (diagnosticsEnabled()) {
        startCompileTimer(deps, state)
    }
}

async function initTreeViews(deps: ExtensionDeps, history: HistoryItem[]) {
    const tasks = [initThreadsTree(deps), initAsdfSystemsTree(deps), initPackagesTree(deps)]

    await Promise.allSettled(tasks)

    deps.ui.initHistoryTree(history)
}

async function initThreadsTree(deps: ExtensionDeps) {
    try {
        const threads = await deps.lsp.listThreads()
        deps.ui.initThreadsTree(threads)
    } catch (err) {
        log(`Failed to init threads tree: ${err}`)
    }
}

async function initAsdfSystemsTree(deps: ExtensionDeps) {
    try {
        const systems = await deps.lsp.listAsdfSystems()
        deps.ui.initAsdfSystemsTree(systems)
    } catch (err) {
        log(`Failed to init ASDF tree: ${err}`)
    }
}

async function initPackagesTree(deps: ExtensionDeps) {
    try {
        const pkgs = await deps.lsp.listPackages()
        deps.ui.initPackagesTree(pkgs)
    } catch (err) {
        log(`Failed to init packages tree: ${err}`)
    }
}

async function diagnosticsRefresh(deps: ExtensionDeps, state: ExtensionState, editors: vscode.TextEditor[]) {
    for (const editor of editors) {
        if (editor.document.languageId === COMMON_LISP_ID) {
            const resp = await tryCompile(state, deps.lsp, editor.document)

            if (resp !== undefined) {
                await updateDiagnostics(state.diagnostics, editor.document.fileName, resp.notes)
            }
        }
    }
}

function initUI(deps: ExtensionDeps, state: ExtensionState) {
    deps.ui.on('saveReplHistory', (items: HistoryItem[]) => saveReplHistory(state.replHistoryFile, items))
    deps.ui.on('listPackages', async (fn) => fn(await deps.lsp.listPackages()))
    deps.ui.on('eval', (text, pkgName, storeResult) => deps.lsp.eval(text, pkgName, storeResult))
    deps.ui.on('inspect', (text, pkgName) => deps.lsp.inspect(text, pkgName))
    deps.ui.on('inspectClosed', (info) => deps.lsp.inspectClosed(info))
    deps.ui.on('inspectEval', (info, text) => deps.lsp.inspectEval(info, text))
    deps.ui.on('inspectRefresh', (info) => deps.lsp.inspectRefresh(info))
    deps.ui.on('inspectRefreshMacro', (info) => deps.lsp.inspectRefreshMacro(info))
    deps.ui.on('inspectMacroInc', (info) => deps.lsp.inspectMacroInc(info))
    deps.ui.on('diagnosticsRefresh', (editors) => diagnosticsRefresh(deps, state, editors))

    deps.ui.initInspector()
}

function initLSP(deps: ExtensionDeps, state: ExtensionState) {
    deps.lsp.on('refreshPackages', () => cmds.refreshPackages(deps))
    deps.lsp.on('refreshAsdfSystems', () => cmds.refreshAsdfSystems(deps))
    deps.lsp.on('refreshThreads', () => cmds.refreshThreads(deps))
    deps.lsp.on('refreshInspectors', () => deps.ui.refreshInspectors())
    deps.lsp.on('refreshDiagnostics', () => deps.ui.refreshDiagnostics())
    deps.lsp.on('startCompileTimer', () => startCompileTimer(deps, state))
    deps.lsp.on('output', (str) => deps.ui.addReplText(str))
    deps.lsp.on('getRestartIndex', async (info, fn) => fn(await deps.ui.getRestartIndex(info)))
    deps.lsp.on('getUserInput', async (fn) => fn(await deps.ui.getUserInput()))
    deps.lsp.on('inspectResult', (result: InspectInfo) => deps.ui.newInspector(result))
    deps.lsp.on('inspectUpdate', (result: InspectResult) => deps.ui.updateInspector(result))
}
