import { promises as fs } from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { readAliveConfig } from './config'
import { isFiniteNumber, isHistoryItem, isString } from './vscode/Guards'
import { log, toLog } from './vscode/Log'
import { ExtensionState, HistoryItem, InspectInfo, InspectResult } from './vscode/Types'
import { UI } from './vscode/UI'
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
import * as cmds from './vscode/commands'
import { getHoverProvider } from './vscode/providers/Hover'
import { isExportNode, isPackageNode } from './vscode/views/PackagesTree'
import { isHistoryNode } from './vscode/views/ReplHistory'
import { isThreadNode } from './vscode/views/ThreadsTree'

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

    const aliveCfg = readAliveConfig()
    const workspacePath = await getWorkspaceOrFilePath()

    log(`Workspace Path: ${toLog(workspacePath)}`)

    await updateEditorConfig()

    const state: ExtensionState = {
        diagnostics: vscode.languages.createDiagnosticCollection('Compiler Diagnostics'),
        hoverText: '',
        compileRunning: false,
        compileTimeoutID: undefined,
        ctx,
        workspacePath,
        replHistoryFile: path.join(workspacePath, '.vscode', 'alive', 'repl-history.json'),
    }

    const ui = createUI(state)
    const lsp = new LSP(state)
    const remoteCfg = { ...aliveCfg.lsp.remote }
    const hostPort = { host: '', port: 0 }

    registerUIEvents(ui, lsp, state)
    registerLSPEvents(ui, lsp, state)

    if (remoteCfg.host == null || remoteCfg.port == null) {
        const srvPort = await startLocalServer(state)

        if (srvPort === undefined) {
            return
        }

        hostPort.host = '127.0.0.1'
        hostPort.port = srvPort

        log(`Server port ${toLog(remoteCfg.port)}`)
    } else {
        log(`Using remote server ${toLog(remoteCfg.host)} ${toLog(remoteCfg.port)}`)
    }

    const history = await readReplHistory(state.replHistoryFile)

    await lsp.connect(hostPort)
    await initTreeViews(ui, lsp, history)

    const activeDoc = vscode.window.activeTextEditor?.document

    if (activeDoc !== undefined && hasValidLangId(activeDoc, [COMMON_LISP_ID])) {
        lsp.editorChanged(activeDoc)
    }

    ctx.subscriptions.push(
        vscode.commands.registerCommand('alive.selectSexpr', () => cmds.selectSexpr(lsp)),
        vscode.commands.registerCommand('alive.sendToRepl', () => cmds.sendToRepl(lsp)),
        vscode.commands.registerCommand('alive.loadAsdfSystem', () => cmds.loadAsdfSystem(lsp)),
        vscode.commands.registerCommand('alive.compileFile', () => cmds.compileFile(lsp, state)),

        vscode.commands.registerCommand('alive.refreshPackages', async () => cmds.refreshPackages(ui, lsp)),

        vscode.commands.registerCommand('alive.refreshAsdfSystems', () => cmds.refreshAsdfSystems(ui, lsp)),
        vscode.commands.registerCommand('alive.refreshThreads', () => cmds.refreshThreads(ui, lsp)),
        vscode.commands.registerCommand('alive.clearRepl', () => cmds.clearRepl(ui)),
        vscode.commands.registerCommand('alive.clearInlineResults', () => cmds.clearInlineResults(state)),
        vscode.commands.registerCommand('alive.inlineEval', () => cmds.inlineEval(lsp, state)),
        vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(lsp)),
        vscode.commands.registerCommand('alive.inspect', (symbol) => cmds.inspect(lsp, symbol)),
        vscode.commands.registerCommand('alive.inspectMacro', () => cmds.inspectMacro(lsp)),
        vscode.commands.registerCommand('alive.openScratchPad', () => cmds.openScratchPad(state)),
        vscode.commands.registerCommand('alive.macroexpand', () => cmds.macroexpand(lsp)),
        vscode.commands.registerCommand('alive.macroexpand1', () => cmds.macroexpand1(lsp)),

        vscode.commands.registerCommand('alive.replHistory', async () => {
            const item = await ui.selectHistoryItem()

            if (item === undefined) {
                return
            }

            await saveReplHistory(state.replHistoryFile, ui.getHistoryItems())

            lsp.eval(item.text, item.pkgName)
        }),

        vscode.commands.registerCommand('alive.clearReplHistory', () => {
            ui.clearReplHistory()

            saveReplHistory(state.replHistoryFile, [])
        }),

        vscode.commands.registerCommand('alive.removePackage', (node) => {
            if (!isPackageNode(node) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            lsp.removePackage(node.label)
        }),

        vscode.commands.registerCommand('alive.removeExport', (node) => {
            if (!isExportNode(node) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            lsp.removeExport(node.pkg, node.label)
        }),

        vscode.commands.registerCommand('alive.loadAsdfByName', async (node) => {
            if (typeof node.label !== 'string' || node.label === '') {
                return
            }

            await vscode.workspace.saveAll()

            ui.addReplText(`Loading ASDF System ${node.label}`)

            await lsp.loadAsdfSystem(node.label)

            ui.addReplText(`Done Loading ASDF System ${node.label}`)
        }),

        vscode.commands.registerCommand('alive.killThread', (node) => {
            if (!isThreadNode(node) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            lsp.killThread(node.thread)
        }),

        vscode.commands.registerCommand('alive.evalHistory', (node) => {
            if (!isHistoryNode(node) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            ui.moveHistoryNodeToTop(node)
            lsp.eval(node.item.text, node.item.pkgName)
        }),

        vscode.commands.registerCommand('alive.editHistory', (node) => {
            if (!isHistoryNode(node) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            ui.setReplPackage(node.item.pkgName)
            ui.setReplInput(node.item.text)
        }),

        vscode.commands.registerCommand('alive.removeHistory', (node) => {
            if (!isHistoryNode(node) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            ui.removeHistoryNode(node)

            saveReplHistory(state.replHistoryFile, ui.getHistoryItems())
        })
    )

    setWorkspaceEventHandlers(ui, lsp, state)

    vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider(state, lsp))

    await vscode.commands.executeCommand('replHistory.focus')
    await vscode.commands.executeCommand('lispRepl.focus')

    if (activeDoc !== undefined) {
        vscode.window.showTextDocument(activeDoc)
    }
}

function createUI(state: ExtensionState) {
    const ui = new UI(state)

    ui.init()
    ui.registerProviders()
    ui.initInspector()

    return ui
}

async function updateEditorConfig() {
    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        return
    }

    const editorConfig = vscode.workspace.getConfiguration('editor')
    await editorConfig.update('formatOnType', true, false, true)

    const lispConfig = vscode.workspace.getConfiguration('', { languageId: COMMON_LISP_ID })
    await lispConfig.update('editor.wordSeparators', wordSeparators, false, true)

    log(`Format On Type: ${editorConfig.get('formatOnType')}`)
}

async function startLocalServer(state: ExtensionState): Promise<number | undefined> {
    state.lspInstallPath = await downloadLspServer()
    if (!isString(state.lspInstallPath)) {
        return
    }

    const port = await startLspServer(state)

    return isFiniteNumber(port) ? port : undefined
}

function setWorkspaceEventHandlers(ui: UI, lsp: LSP, state: ExtensionState) {
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => openTextDocument(ui, lsp, state, doc))

    vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent) => lsp.textDocumentChanged(event.document),
        null,
        state.ctx.subscriptions
    )

    vscode.window.onDidChangeActiveTextEditor(
        (editor?: vscode.TextEditor) => {
            if (editor?.document !== undefined) {
                lsp.editorChanged(editor.document)
            }
        },
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
            if (!isHistoryItem(item)) {
                continue
            }

            history.push(item)
        }

        return history
    } catch (err) {
        return []
    }
}

function openTextDocument(ui: UI, lsp: LSP, state: ExtensionState, doc: Pick<vscode.TextDocument, 'languageId'>) {
    if (!hasValidLangId(doc, [COMMON_LISP_ID])) {
        return
    }

    if (diagnosticsEnabled()) {
        startCompileTimer(ui, lsp, state)
    }
}

async function initTreeViews(
    ui: Pick<UI, 'initHistoryTree' | 'initThreadsTree' | 'initAsdfSystemsTree' | 'initPackagesTree'>,
    lsp: Pick<LSP, 'listThreads' | 'listAsdfSystems' | 'listPackages'>,
    history: HistoryItem[]
) {
    const tasks = [initThreadsTree(ui, lsp), initAsdfSystemsTree(ui, lsp), initPackagesTree(ui, lsp)]

    await Promise.allSettled(tasks)

    ui.initHistoryTree(history)
}

async function initThreadsTree(ui: Pick<UI, 'initThreadsTree'>, lsp: Pick<LSP, 'listThreads'>) {
    try {
        const threads = await lsp.listThreads()
        ui.initThreadsTree(threads)
    } catch (err) {
        log(`Failed to init threads tree: ${err}`)
    }
}

async function initAsdfSystemsTree(ui: Pick<UI, 'initAsdfSystemsTree'>, lsp: Pick<LSP, 'listAsdfSystems'>) {
    try {
        const systems = await lsp.listAsdfSystems()
        ui.initAsdfSystemsTree(systems)
    } catch (err) {
        log(`Failed to init ASDF tree: ${err}`)
    }
}

async function initPackagesTree(ui: Pick<UI, 'initPackagesTree'>, lsp: Pick<LSP, 'listPackages'>) {
    try {
        const pkgs = await lsp.listPackages()
        ui.initPackagesTree(pkgs)
    } catch (err) {
        log(`Failed to init packages tree: ${err}`)
    }
}

async function diagnosticsRefresh(lsp: Pick<LSP, 'tryCompileFile'>, state: ExtensionState, editors: vscode.TextEditor[]) {
    for (const editor of editors) {
        if (editor.document.languageId !== COMMON_LISP_ID) {
            continue
        }

        const resp = await tryCompile(state, lsp, editor.document)

        if (resp !== undefined) {
            await updateDiagnostics(state.diagnostics, editor.document.fileName, resp.notes)
        }
    }
}

function registerUIEvents(ui: UI, lsp: LSP, state: ExtensionState) {
    ui.on('saveReplHistory', (items: HistoryItem[]) => saveReplHistory(state.replHistoryFile, items))
    ui.on('listPackages', async (fn) => fn(await lsp.listPackages()))
    ui.on('eval', (text, pkgName, storeResult) => lsp.eval(text, pkgName, storeResult))
    ui.on('inspect', (text, pkgName) => lsp.inspect(text, pkgName))
    ui.on('inspectClosed', (info) => lsp.inspectClosed(info))
    ui.on('inspectEval', (info, text) => lsp.inspectEval(info, text))
    ui.on('inspectRefresh', (info) => lsp.inspectRefresh(info))
    ui.on('inspectRefreshMacro', (info) => lsp.inspectRefreshMacro(info))
    ui.on('inspectMacroInc', (info) => lsp.inspectMacroInc(info))
    ui.on('diagnosticsRefresh', (editors) => diagnosticsRefresh(lsp, state, editors))
}

function registerLSPEvents(ui: UI, lsp: LSP, state: ExtensionState) {
    lsp.on('refreshPackages', () => cmds.refreshPackages(ui, lsp))
    lsp.on('refreshAsdfSystems', () => cmds.refreshAsdfSystems(ui, lsp))
    lsp.on('refreshThreads', () => cmds.refreshThreads(ui, lsp))
    lsp.on('refreshInspectors', () => ui.refreshInspectors())
    lsp.on('refreshDiagnostics', () => ui.refreshDiagnostics())
    lsp.on('startCompileTimer', () => startCompileTimer(ui, lsp, state))
    lsp.on('output', (str) => ui.addReplText(str))
    lsp.on('getRestartIndex', async (info, fn) => fn(await ui.getRestartIndex(info)))
    lsp.on('getUserInput', async (fn) => fn(await ui.getUserInput()))
    lsp.on('inspectResult', (result: InspectInfo) => ui.newInspector(result))
    lsp.on('inspectUpdate', (result: InspectResult) => ui.updateInspector(result))
}
