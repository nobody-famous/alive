import * as vscode from 'vscode'
import * as cmds from './vscode/commands'
import * as path from 'path'
import { promises as fs } from 'fs'
import { ThreadsTreeProvider, PackagesTreeProvider, PackageNode, ExportNode, ThreadNode } from './vscode/providers'
import { ExtensionState, HistoryItem } from './vscode/Types'
import { COMMON_LISP_ID, getWorkspacePath, hasValidLangId, selectHistoryItem, startCompileTimer } from './vscode/Utils'
import { LSP } from './vscode/backend/LSP'
import { LispRepl } from './vscode/providers/LispRepl'
import { AsdfSystemsTreeProvider } from './vscode/providers/AsdfSystemsTree'
import { startLspServer } from './vscode/backend/ChildProcess'
import { HistoryNode, ReplHistoryTreeProvider } from './vscode/providers/ReplHistory'
import { getHoverProvider } from './vscode/providers/Hover'
import { UserInterface } from './vscode/UserInterface'
import { ExtensionController } from './vscode/ExtensionController'

export const activate = async (ctx: vscode.ExtensionContext) => {
    const workspacePath = await getWorkspacePath()
    const replHistoryFile =
        workspacePath !== undefined ? path.join(workspacePath, '.vscode', 'alive', 'repl-history.json') : undefined

    const state: ExtensionState = { hoverText: '', compileRunning: false, compileTimeoutID: undefined, historyNdx: -1, ctx }
    const ui: UserInterface = new UserInterface(state)
    const backend = new LSP(state)
    const ctrl = new ExtensionController(backend, ui)

    ctrl.on('saveHistory', (items: HistoryItem[]) => {
        if (replHistoryFile !== undefined) {
            saveReplHistory(replHistoryFile, items)
        }
    })

    const port = await startLspServer(state)
    const history = replHistoryFile !== undefined ? await readReplHistory(replHistoryFile) : []

    await backend.connect({ host: '127.0.0.1', port })
    await ctrl.initTreeViews(history)

    const activeDoc = vscode.window.activeTextEditor?.document

    if (activeDoc !== undefined && hasValidLangId(activeDoc, [COMMON_LISP_ID])) {
        backend.editorChanged(vscode.window.activeTextEditor)
    }

    const repl = await initRepl(ctx, state, backend, replHistoryFile)

    registerCommands(ctx, state, backend, replHistoryFile, repl)
    setWorkspaceEventHandlers(ctx, state)

    await vscode.commands.executeCommand('replHistory.focus')
    await vscode.commands.executeCommand('lispRepl.focus')

    if (activeDoc !== undefined) {
        vscode.window.showTextDocument(activeDoc)
    }
}

function setWorkspaceEventHandlers(ctx: vscode.ExtensionContext, state: ExtensionState) {
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => openTextDocument(state, doc))

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
}

function registerCommands(
    ctx: vscode.ExtensionContext,
    state: ExtensionState,
    backend: LSP,
    replHistoryFile: string | undefined,
    repl: LispRepl
) {
    ctx.subscriptions.push(
        vscode.commands.registerCommand('alive.selectSexpr', () => backend.selectSexpr(vscode.window.activeTextEditor)),
        vscode.commands.registerCommand('alive.sendToRepl', () => backend.sendToRepl(vscode.window.activeTextEditor)),
        vscode.commands.registerCommand('alive.loadAsdfSystem', () => cmds.loadAsdfSystem(state)),
        vscode.commands.registerCommand('alive.refreshPackages', () => cmds.refreshPackages(state)),
        vscode.commands.registerCommand('alive.refreshAsdfSystems', () => cmds.refreshAsdfSystems(state)),
        vscode.commands.registerCommand('alive.refreshThreads', () => cmds.refreshThreads(state)),
        vscode.commands.registerCommand('alive.clearRepl', () => repl.clear()),
        vscode.commands.registerCommand('alive.clearInlineResults', () => cmds.clearInlineResults(state)),
        vscode.commands.registerCommand('alive.inlineEval', () => backend.inlineEval(vscode.window.activeTextEditor)),
        vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(state)),

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
}

async function initRepl(ctx: vscode.ExtensionContext, state: ExtensionState, backend: LSP, replHistoryFile?: string) {
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

    backend.on('output', (str: string) => {
        repl.addText(str)
    })

    return repl
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

function openTextDocument(state: ExtensionState, doc: vscode.TextDocument) {
    if (!hasValidLangId(doc, [COMMON_LISP_ID])) {
        return
    }

    startCompileTimer(state)
}
