import { promises as fs } from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { readAliveConfig } from './config'
import { isFiniteNumber, isHistoryItem, isString } from './vscode/Guards'
import { log, toLog } from './vscode/Log'
import { ExtensionState, HistoryItem, InspectInfo, InspectResult, isLispSymbol } from './vscode/Types'
import { UI } from './vscode/UI'
import {
    COMMON_LISP_ID,
    getWorkspaceOrFilePath,
    hasValidLangId,
    startCompileTimer,
    tryCompile,
    updateDiagnostics,
} from './vscode/Utils'
import { LSP } from './vscode/backend/LSP'
import { downloadLspServer, getInstallPath, spawnLspProcess } from './vscode/backend/LspProcess'
import { disconnectChild } from './vscode/backend/ProcUtils'
import * as cmds from './vscode/commands'
import { getHoverProvider } from './vscode/providers/Hover'
import { isHistoryNode } from './vscode/views/ReplHistory'
import { isThreadNode } from './vscode/views/ThreadsTree'
import { isLeafNode, isPackageNode } from './vscode/views/BasePackagesTree'

export const activate = async (ctx: Pick<vscode.ExtensionContext, 'subscriptions' | 'extensionPath'>) => {
    log('Activating extension')
    vscode.commands.executeCommand('setContext', 'aliveExtensionActive', true)

    const extensionMetadata = vscode.extensions.getExtension('rheller.alive')
    if (extensionMetadata === undefined) {
        log('Failed to find rheller.alive extension config directory')
        return
    }

    const workspacePath = await getWorkspaceOrFilePath()

    log(`Workspace Path: ${toLog(workspacePath)}`)

    const state: ExtensionState = {
        extension: extensionMetadata,
        config: readAliveConfig(),
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
    const remoteCfg = { ...state.config.lsp.remote }
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

        log(`Using local server ${toLog(hostPort.host)}:${toLog(hostPort.port)}`)
    } else {
        hostPort.host = remoteCfg.host
        hostPort.port = remoteCfg.port

        log(`Using remote server ${toLog(hostPort.host)}:${toLog(hostPort.port)}`)
    }

    const history = await readReplHistory(state.replHistoryFile)

    await lsp.connect(hostPort)
    await initTreeViews(ui, lsp, history)

    const activeDoc = vscode.window.activeTextEditor?.document

    if (activeDoc !== undefined && hasValidLangId(activeDoc, [COMMON_LISP_ID])) {
        lsp.editorChanged(activeDoc)
    }

    for (let index = 0; index <= 9; index++) {
        vscode.commands.registerCommand(`alive.restart_${index}`, () => cmds.selectRestart(ui, index))
    }

    ctx.subscriptions.push(
        vscode.commands.registerCommand('alive.selectSexpr', () => cmds.selectSexpr(lsp)),
        vscode.commands.registerCommand('alive.sendToRepl', () => cmds.sendToRepl(lsp)),
        vscode.commands.registerCommand('alive.loadAsdfSystem', () => cmds.loadAsdfSystem(lsp)),
        vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(lsp)),
        vscode.commands.registerCommand('alive.compileFile', () => cmds.compileFile(lsp, state)),

        vscode.commands.registerCommand('alive.refreshPackages', async () => cmds.refreshPackages(ui, lsp)),
        vscode.commands.registerCommand('alive.refreshTracedFunctions', () => cmds.refreshTracedFunctions(ui, lsp)),
        vscode.commands.registerCommand('alive.refreshAsdfSystems', () => cmds.refreshAsdfSystems(ui, lsp)),
        vscode.commands.registerCommand('alive.refreshThreads', () => cmds.refreshThreads(ui, lsp)),

        vscode.commands.registerCommand('alive.clearRepl', () => cmds.clearRepl(ui)),
        vscode.commands.registerCommand('alive.toggleReplWordWrap', () => cmds.toggleReplWordWrap(ui)),
        vscode.commands.registerCommand('alive.clearInlineResults', () => cmds.clearInlineResults(state)),

        vscode.commands.registerCommand('alive.inlineEval', () => cmds.inlineEval(lsp, state)),
        vscode.commands.registerCommand('alive.evalSurrounding', () => cmds.evalSurrounding(lsp)),
        vscode.commands.registerCommand('alive.inlineEvalSurrounding', () => cmds.inlineEvalSurrounding(lsp, state)),

        vscode.commands.registerCommand('alive.inspectMacro', () => cmds.inspectMacro(lsp)),
        vscode.commands.registerCommand('alive.openScratchPad', () => cmds.openScratchPad(state)),
        vscode.commands.registerCommand('alive.macroexpand', () => cmds.macroexpand(lsp)),
        vscode.commands.registerCommand('alive.macroexpand1', () => cmds.macroexpand1(lsp)),
        vscode.commands.registerCommand('alive.traceFunction', () => cmds.traceFunction(lsp)),
        vscode.commands.registerCommand('alive.untraceFunction', () => cmds.untraceFunction(lsp)),
        vscode.commands.registerCommand('alive.tracePackage', () => cmds.tracePackage(ui, lsp)),
        vscode.commands.registerCommand('alive.untracePackage', () => cmds.untracePackage(ui, lsp)),
        vscode.commands.registerCommand('alive.untraceFunctionNode', (node) => {
            if (!isLeafNode(node) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            lsp.untraceFunctionByName(node.pkg, node.label)
        }),
        vscode.commands.registerCommand('alive.untracePackageNode', (node) => {
            if (!isPackageNode(node) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            lsp.untracePackage(node.label)
        }),

        vscode.commands.registerCommand('alive.inspect', async (symbol) => {
            if (isLispSymbol(symbol)) {
                await cmds.inspect(lsp, symbol)
            }
        }),

        vscode.commands.registerCommand('alive.replHistory', async () => {
            const item = await ui.selectHistoryItem()

            if (item === undefined) {
                return
            }

            await saveReplHistory(state.replHistoryFile, ui.getHistoryItems())

            lsp.evalWithOutput(item.text, item.pkgName)
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
            if (!isLeafNode(node) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            lsp.removeExport(node.pkg, node.label)
        }),

        vscode.commands.registerCommand('alive.loadAsdfByName', async (node) => {
            if (typeof node.label !== 'string' || node.label === '') {
                return
            }

            await vscode.workspace.saveAll()

            ui.addReplOutput(`Loading ASDF System ${node.label}`)

            await lsp.loadAsdfSystem(node.label)

            ui.addReplOutput(`Done Loading ASDF System ${node.label}`)
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
            lsp.evalWithOutput(node.item.text, node.item.pkgName)
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

export const deactivate = () => {
    vscode.commands.executeCommand('setContext', 'aliveExtensionActive', false)
}

function createUI(state: ExtensionState) {
    const ui = new UI(state)

    ui.init()
    ui.registerProviders()
    ui.initInspector()

    return ui
}

function handleDisconnect(state: Pick<ExtensionState, 'child'>) {
    return async (code: number, signal: string) => {
        log(`Disconnected: CODE ${toLog(code)} SIGNAL ${toLog(signal)}`)

        if (state.child === undefined) {
            log('Disconnect: No child process')
            return
        }

        try {
            if (!(await disconnectChild(state.child))) {
                vscode.window.showWarningMessage('Disconnect: Failed to kill child process')
            }
        } catch (err) {
            vscode.window.showWarningMessage(`Disconnect: ${toLog(err)}`)
        } finally {
            state.child = undefined
        }
    }
}

async function startLocalServer(state: ExtensionState): Promise<number | undefined> {
    const config = state.config

    if (!isString(config.lsp.downloadUrl)) {
        throw new Error('No download URL given for LSP server')
    }

    state.lspInstallPath = getInstallPath() ?? (await downloadLspServer(state.extension, config.lsp.downloadUrl))
    if (!isString(state.lspInstallPath)) {
        throw new Error('No install path given for LSP server')
    }

    if (config.lsp.startCommand.length === 0) {
        throw new Error('No command given for LSP server')
    }

    const { child, port } = await spawnLspProcess({
        lspInstallPath: state.lspInstallPath,
        workspacePath: state.workspacePath,
        command: config.lsp.startCommand,
        onDisconnect: handleDisconnect(state),
        onError: (err: Error) => {
            vscode.window.showErrorMessage(err.message)
        },
    })

    state.child = child
    state.child.on('disconnect', handleDisconnect(state))

    return isFiniteNumber(port) ? port : undefined
}

function setWorkspaceEventHandlers(ui: UI, lsp: LSP, state: ExtensionState) {
    vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent) => lsp.textDocumentChanged(event.document),
        null,
        state.ctx.subscriptions
    )

    vscode.workspace.onDidChangeConfiguration(async () => {
        state.config = readAliveConfig()

        const pkgs = await lsp.listPackages()
        ui.updatePackages(pkgs)
    })

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

async function initTreeViews(
    ui: Pick<UI, 'initHistoryTree' | 'initThreadsTree' | 'initTracedFunctionsTree' | 'initAsdfSystemsTree' | 'initPackagesTree'>,
    lsp: Pick<LSP, 'listThreads' | 'listTracedFunctions' | 'listAsdfSystems' | 'listPackages'>,
    history: HistoryItem[]
) {
    const tasks = [
        initThreadsTree(ui, lsp),
        initTracedFunctionsTree(ui, lsp),
        initAsdfSystemsTree(ui, lsp),
        initPackagesTree(ui, lsp),
    ]

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

async function initTracedFunctionsTree(ui: Pick<UI, 'initTracedFunctionsTree'>, lsp: Pick<LSP, 'listTracedFunctions'>) {
    try {
        const traced = await lsp.listTracedFunctions()
        ui.initTracedFunctionsTree(traced)
    } catch (err) {
        log(`Failed to init traced functions tree: ${err}`)
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

async function diagnosticsRefresh(
    lsp: Pick<LSP, 'tryCompileFile'>,
    state: ExtensionState,
    editors: readonly vscode.TextEditor[]
) {
    for (const editor of editors) {
        if (editor.document.languageId !== COMMON_LISP_ID) {
            continue
        }

        const resp = await tryCompile(state, state.config, lsp, editor.document, true)

        if (resp !== undefined) {
            await updateDiagnostics(state.diagnostics, editor.document.fileName, resp.notes)
        }
    }
}

function registerUIEvents(ui: UI, lsp: LSP, state: ExtensionState) {
    ui.on('saveReplHistory', (items: HistoryItem[]) => saveReplHistory(state.replHistoryFile, items))
    ui.on('listPackages', async (fn) => fn(await lsp.listPackages()))
    ui.on('eval', (text, pkgName, storeResult) => lsp.evalWithOutput(text, pkgName, storeResult))
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
    lsp.on('refreshTracedFunctions', () => cmds.refreshTracedFunctions(ui, lsp))
    lsp.on('refreshAsdfSystems', () => cmds.refreshAsdfSystems(ui, lsp))
    lsp.on('refreshThreads', () => cmds.refreshThreads(ui, lsp))
    lsp.on('refreshInspectors', () => ui.refreshInspectors())
    lsp.on('refreshDiagnostics', () => ui.refreshDiagnostics())
    lsp.on('startCompileTimer', () => startCompileTimer(ui, lsp, state, state.config))
    lsp.on('compileImmediate', () => cmds.tryCompileWithDiags(lsp, state, state.config, true))
    lsp.on('input', (str, pkgName) => ui.addReplOutput(str, pkgName))
    lsp.on('output', (str) => ui.addReplOutput(str))
    lsp.on('queryText', (str) => ui.setQueryText(str))
    lsp.on('getRestartIndex', async (info, fn) => fn(await ui.getRestartIndex(info)))
    lsp.on('getUserInput', async (fn) => fn(await ui.getUserInput()))
    lsp.on('inspectResult', (result: InspectInfo) => ui.newInspector(result))
    lsp.on('inspectUpdate', (result: InspectResult) => ui.updateInspector(result))
}
