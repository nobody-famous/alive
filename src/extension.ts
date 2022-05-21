import * as vscode from 'vscode'
import * as cmds from './vscode/commands'
import * as path from 'path'
import { promises as fs } from 'fs'
import { ThreadsTreeProvider, PackagesTreeProvider, PackageNode, ExportNode, ThreadNode } from './vscode/providers'
import { DebugInfo, ExtensionState, HistoryItem } from './vscode/Types'
import { COMMON_LISP_ID, getWorkspacePath, hasValidLangId, selectHistoryItem, startCompileTimer } from './vscode/Utils'
import { LSP } from './vscode/backend/LSP'
import { LispRepl } from './vscode/providers/LispRepl'
import { AsdfSystemsTreeProvider } from './vscode/providers/AsdfSystemsTree'
import { startLspServer } from './vscode/backend/ChildProcess'
import { HistoryNode, ReplHistoryTreeProvider } from './vscode/providers/ReplHistory'
import { DebugView } from './vscode/repl'

let state: ExtensionState = { hoverText: '', compileRunning: false, compileTimeoutID: undefined, historyNdx: -1 }

export const activate = async (ctx: vscode.ExtensionContext) => {
    const backend = new LSP({ extState: state })
    const workspacePath = await getWorkspacePath()
    const replHistoryFile =
        workspacePath !== undefined ? path.join(workspacePath, '.vscode', 'alive', 'repl-history.json') : undefined

    state.backend = backend

    const port = await startLspServer(state)
    await state.backend.connect({ host: '127.0.0.1', port })

    const activeDoc = vscode.window.activeTextEditor?.document

    if (activeDoc !== undefined && hasValidLangId(activeDoc, [COMMON_LISP_ID])) {
        backend.editorChanged(vscode.window.activeTextEditor)
    }

    const pkgs = await backend.listPackages()
    const systems = await backend.listAsdfSystems()
    const threads = await backend.listThreads()
    const history = replHistoryFile !== undefined ? await readReplHistory(replHistoryFile) : []

    state.packageTree = new PackagesTreeProvider(pkgs)
    state.asdfTree = new AsdfSystemsTreeProvider(systems)
    state.threadTree = new ThreadsTreeProvider(threads)
    state.historyTree = new ReplHistoryTreeProvider(history)

    const repl = new LispRepl(ctx)

    repl.on('eval', async (pkg: string, text: string) => {
        if (state.historyNdx >= 0) {
            const item = state.historyTree?.items[state.historyNdx]

            if (item !== undefined && item.pkgName === pkg && item.text === text) {
                state.historyTree?.removeItem(state.historyNdx)
            }
        }

        state.historyTree?.addItem(pkg, text)

        if (replHistoryFile !== undefined && state.historyTree !== undefined) {
            await saveReplHistory(replHistoryFile, state.historyTree.items)
        }

        state.historyNdx = -1
        await backend.eval(text, pkg, true)
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

    const updateReplInput = () => {
        if (state.historyTree === undefined) {
            return
        }

        if (state.historyNdx >= 0) {
            const item = state.historyTree.items[state.historyNdx]

            repl.setPackage(item.pkgName)
            repl.setInput(item.text)
        } else {
            repl.clearInput()
        }
    }

    repl.on('historyUp', () => {
        if (state.historyTree === undefined) {
            return
        }

        if (state.historyNdx < state.historyTree?.items.length - 1) {
            state.historyNdx += 1
        }

        updateReplInput()
    })

    repl.on('historyDown', () => {
        if (state.historyTree === undefined) {
            return
        }

        if (state.historyNdx >= 0) {
            state.historyNdx -= 1
        }

        updateReplInput()
    })

    backend.on('output', (str: unknown) => {
        if (typeof str === 'string') {
            repl.addText(str)
        }
    })

    backend.on('debug', (data: unknown) => {
        if (typeof data !== 'object' || data === null) {
            throw new Error('Invalid debugger info')
        }

        const dataObj = data as { [index: string]: unknown }

        if (typeof dataObj.message !== 'string' || !Array.isArray(dataObj.restarts) || !Array.isArray(dataObj.stackTrace)) {
            throw new Error('Invalid debugger info')
        }

        for (const item of dataObj.restarts) {
            if (typeof item !== 'string') {
                throw new Error('Invalid debugger info')
            }
        }

        for (const item of dataObj.stackTrace) {
            if (typeof item !== 'string') {
                throw new Error('Invalid debugger info')
            }
        }

        const info: DebugInfo = {
            message: dataObj.message,
            restarts: dataObj.restarts,
            stackTrace: dataObj.stackTrace,
        }
        const view = new DebugView(ctx, 'Debug', vscode.ViewColumn.Two, info)

        view.on('restart', (num: number) => {
            console.log('RESTART', num)
            view.stop()
        })

        view.run()
    })

    vscode.window.registerTreeDataProvider('lispPackages', state.packageTree)
    vscode.window.registerTreeDataProvider('asdfSystems', state.asdfTree)
    vscode.window.registerTreeDataProvider('lispThreads', state.threadTree)
    vscode.window.registerTreeDataProvider('replHistory', state.historyTree)
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

        vscode.commands.registerCommand('alive.replHistory', async () => {
            if (state.historyTree === undefined) {
                return
            }

            const item = await selectHistoryItem(state.historyTree?.items)

            state.historyTree.moveItemToTop(item)

            if (replHistoryFile !== undefined && state.historyTree !== undefined) {
                await saveReplHistory(replHistoryFile, state.historyTree.items)
            }

            state.backend?.eval(item.text, item.pkgName)
        }),

        vscode.commands.registerCommand('alive.clearReplHistory', () => {
            state.historyTree?.clear()

            if (replHistoryFile !== undefined) {
                saveReplHistory(replHistoryFile, [])
            }
        }),

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
        vscode.commands.registerCommand('alive.loadAsdfByName', async (node) => {
            if (typeof node.label !== 'string' || node.label === '') {
                return
            }

            repl.addText(`Loading ASDF System ${node.label}`)
            await backend.loadAsdfSystem(node.label)
            repl.addText(`Done Loading ASDF System ${node.label}`)
        }),
        vscode.commands.registerCommand('alive.killThread', (node) => {
            if (!(node instanceof ThreadNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            backend.killThread(node.thread)
        }),
        vscode.commands.registerCommand('alive.evalHistory', (node) => {
            if (!(node instanceof HistoryNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            state.historyTree?.moveToTop(node)
            backend.eval(node.item.text, node.item.pkgName)
        }),
        vscode.commands.registerCommand('alive.editHistory', (node) => {
            if (!(node instanceof HistoryNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            repl.setPackage(node.item.pkgName)
            repl.setInput(node.item.text)
        }),
        vscode.commands.registerCommand('alive.removeHistory', (node) => {
            if (!(node instanceof HistoryNode) || typeof node.label !== 'string' || node.label === '') {
                return
            }

            state.historyTree?.removeNode(node)

            if (replHistoryFile !== undefined && state.historyTree !== undefined) {
                saveReplHistory(replHistoryFile, state.historyTree.items)
            }
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

    await vscode.commands.executeCommand('replHistory.focus')
    await vscode.commands.executeCommand('lispRepl.focus')

    if (activeDoc !== undefined) {
        vscode.window.showTextDocument(activeDoc)
    }
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

function openTextDocument(doc: vscode.TextDocument) {
    if (!hasValidLangId(doc, [COMMON_LISP_ID])) {
        return
    }

    startCompileTimer(state)
}
