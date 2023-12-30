import EventEmitter = require('events')
import * as vscode from 'vscode'
import { PackagesTreeProvider } from './views/PackagesTree'
import { ThreadsTreeProvider } from './views/ThreadsTree'
import { AsdfSystemsTreeProvider } from './views/AsdfSystemsTree'
import { LispRepl } from './views/LispRepl'
import { HistoryNode, ReplHistoryTreeProvider } from './views/ReplHistory'
import { DebugView } from './views/DebugView'
import { AliveContext, DebugInfo, HistoryItem, InspectInfo, InspectResult, Package, Thread } from './Types'
import { InspectorPanel } from './views/InspectorPanel'
import { Inspector } from './views/Inspector'

export declare interface UIEvents {
    on(event: 'saveReplHistory', listener: (history: HistoryItem[]) => void): this
    on(event: 'eval', listener: (text: string, pkgName: string, storeResult?: boolean) => void): this
    on(event: 'inspect', listener: (text: string, pkgName: string) => void): this
    on(event: 'inspectClosed', listener: (info: InspectInfo) => void): this
    on(event: 'inspectEval', listener: (info: InspectInfo, text: string) => void): this
    on(event: 'inspectRefresh', listener: (info: InspectInfo) => void): this
    on(event: 'inspectRefreshMacro', listener: (info: InspectInfo) => void): this
    on(event: 'inspectMacroInc', listener: (info: InspectInfo) => void): this
    on(event: 'listPackages', listener: (fn: (pkgs: Package[]) => void) => void): this
    on(event: 'diagnosticsRefresh', listener: (editors: vscode.TextEditor[]) => void): this
}

interface UIState {
    ctx: AliveContext
    historyNdx: number
}

export class UI extends EventEmitter implements UIEvents {
    private state: UIState
    private packageTree: PackagesTreeProvider | undefined
    private historyTree: ReplHistoryTreeProvider | undefined
    private asdfTree: AsdfSystemsTreeProvider | undefined
    private threadsTree: ThreadsTreeProvider | undefined
    private replView: LispRepl
    private inspectorPanel: InspectorPanel
    private inspectors: Map<number, Inspector>

    constructor(state: UIState) {
        super()

        this.state = state
        this.replView = new LispRepl(state.ctx)
        this.inspectors = new Map()
        this.inspectorPanel = new InspectorPanel(state.ctx)

        this.initRepl()
        this.initInspectorPanel()

        vscode.window.registerWebviewViewProvider('lispRepl', this.replView)
    }

    clearRepl() {
        this.replView.clear()
    }

    clearReplHistory() {
        this.historyTree?.clear()
    }

    setReplPackage(pkg: string) {
        this.replView.setPackage(pkg)
    }

    setReplInput(input: string) {
        this.replView.setInput(input)
    }

    async getRestartIndex(info: DebugInfo): Promise<number | undefined> {
        let index: number | undefined = undefined

        return new Promise<number>((resolve, reject) => {
            if (this.state.ctx === undefined) {
                return reject('Debugger: No extension context')
            }

            const view = new DebugView(this.state.ctx, 'Debug', vscode.ViewColumn.Two, info)

            view.on('restart', (num: number) => {
                index = num
                view.stop()
            })

            view.on('debugClosed', () => {
                const num =
                    typeof index === 'number'
                        ? index
                        : info.restarts?.reduce((acc: number | undefined, item, ndx) => {
                              return typeof acc === 'number' || item.name.toLocaleUpperCase() !== 'abort' ? acc : ndx
                          }, undefined)

                view.stop()

                typeof num === 'number' ? resolve(num) : reject('Failed to abort debugger')
            })

            view.on('jump-to', async (file: string, line: number, char: number) => {
                const doc = await vscode.workspace.openTextDocument(file)
                const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One)
                const pos = new vscode.Position(line, char)
                const range = new vscode.Range(
                    new vscode.Position(Math.max(0, pos.line - 10), pos.character),
                    new vscode.Position(Math.max(0, pos.line + 10), pos.character)
                )

                editor.selection = new vscode.Selection(pos, pos)
                editor.revealRange(range)
            })

            view.run()
        })
    }

    async getUserInput(): Promise<string> {
        const waitForInput = () => {
            return new Promise<string>((resolve) => {
                const recvInput = (text: string) => {
                    this.replView?.off('userInput', recvInput)
                    resolve(text)
                }

                this.replView?.on('userInput', recvInput)
            })
        }

        await vscode.commands.executeCommand('lispRepl.focus')

        this.replView?.getUserInput()

        return waitForInput()
    }

    updateThreads(threads: Thread[]): void {
        this.threadsTree?.update(threads)
    }

    updateAsdfSystems(systems: string[]): void {
        this.asdfTree?.update(systems)
    }

    updatePackages(pkgs: Package[]): void {
        this.packageTree?.update(pkgs)
    }

    initInspector(): void {
        vscode.window.registerWebviewViewProvider('lispInspector', this.inspectorPanel)
    }

    initPackagesTree(pkgs: Package[]): void {
        this.packageTree = new PackagesTreeProvider(pkgs)
        vscode.window.registerTreeDataProvider('lispPackages', this.packageTree)
    }

    initHistoryTree(history: HistoryItem[]): void {
        this.historyTree = new ReplHistoryTreeProvider(history)
        vscode.window.registerTreeDataProvider('replHistory', this.historyTree)
    }

    initAsdfSystemsTree(systems: string[]): void {
        this.asdfTree = new AsdfSystemsTreeProvider(systems)
        vscode.window.registerTreeDataProvider('asdfSystems', this.asdfTree)
    }

    initThreadsTree(threads: Thread[]): void {
        this.threadsTree = new ThreadsTreeProvider(threads)
        vscode.window.registerTreeDataProvider('lispThreads', this.threadsTree)
    }

    getHistoryItems(): HistoryItem[] {
        return this.historyTree?.items ?? []
    }

    removeHistoryNode(node: HistoryNode) {
        this.historyTree?.removeNode(node)
    }

    moveHistoryNodeToTop(node: HistoryNode) {
        this.historyTree?.moveToTop(node)
    }

    selectHistoryItem() {
        return new Promise<HistoryItem>((resolve) => {
            const items = [...(this.historyTree?.items ?? [])]
            const qp = vscode.window.createQuickPick()

            qp.items = items.map<vscode.QuickPickItem>((i) => ({ label: i.text, description: i.pkgName }))

            qp.onDidChangeSelection(async (e) => {
                const item = e[0]

                if (item === undefined) {
                    return
                }

                const historyItem = { text: item.label, pkgName: item.description ?? '' }

                this.historyTree?.moveItemToTop(historyItem)

                resolve(historyItem)

                qp.hide()
            })

            qp.onDidHide(() => qp.dispose())
            qp.show()
        })
    }

    private requestPackages = () => {
        return new Promise<Package[]>((resolve) => {
            this.emit('listPackages', (pkgs: Package[]) => {
                resolve(pkgs)
            })
        })
    }

    private selectPackage = async () => {
        const pkgs = await this.requestPackages()
        const names: string[] = []

        for (const pkg of pkgs) {
            names.push(pkg.name.toLowerCase())

            for (const nick of pkg.nicknames) {
                names.push(nick.toLowerCase())
            }
        }

        return await vscode.window.showQuickPick(names.sort(), { placeHolder: 'Select Package' })
    }

    newInspector(info: InspectInfo) {
        const inspector = new Inspector(this.state.ctx, vscode.ViewColumn.Two, info)

        this.inspectors.set(info.id, inspector)

        inspector.on('inspectorClosed', () => {
            this.inspectors.delete(info.id)
            this.emit('inspectClosed', info)
        })
        inspector.on('inspector-eval', (text: string) => this.emit('inspectEval', info, text))
        inspector.on('inspector-refresh', () => this.emit('inspectRefresh', info))
        inspector.on('inspector-refresh-macro', () => this.emit('inspectRefreshMacro', info))
        inspector.on('inspector-macro-inc', () => this.emit('inspectMacroInc', info))

        inspector.show()
    }

    refreshInspectors() {
        for (const [, insp] of this.inspectors) {
            this.emit('inspectRefresh', insp.info)
        }
    }

    refreshDiagnostics() {
        this.emit('diagnosticsRefresh', vscode.window.visibleTextEditors)
    }

    updateInspector(result: InspectResult) {
        const inspector = this.inspectors.get(result.id)

        if (inspector === undefined) {
            return
        }

        inspector.update(result)
    }

    async initInspectorPanel() {
        this.inspectorPanel.on('inspect', async (pkg: string, text: string) => this.emit('inspect', text, pkg))

        this.inspectorPanel.on('requestPackage', async () => {
            const pick = await this.selectPackage()

            if (pick !== undefined) {
                this.inspectorPanel.setPackage(pick)
            }
        })
    }

    async initRepl() {
        this.replView.on('eval', async (pkg: string, text: string) => {
            const itemsCount = this.historyTree?.items.length ?? 0

            for (let ndx = 0; ndx < itemsCount; ndx += 1) {
                const item = this.historyTree?.items[ndx]

                if (item !== undefined && item.pkgName === pkg && item.text === text) {
                    this.historyTree?.removeItem(ndx)
                }
            }

            this.historyTree?.addItem(pkg, text)

            if (this.historyTree !== undefined) {
                this.emit('saveReplHistory', this.historyTree.items)
            }

            this.state.historyNdx = -1
            this.emit('eval', text, pkg, true)
        })

        this.replView.on('requestPackage', async () => {
            const pick = await this.selectPackage()

            if (pick !== undefined) {
                this.replView.setPackage(pick)
            }
        })

        const updateReplInput = () => {
            if (this.historyTree === undefined) {
                return
            }

            if (this.state.historyNdx >= 0) {
                const item = this.historyTree.items[this.state.historyNdx]

                this.replView.setPackage(item.pkgName)
                this.replView.setInput(item.text)
            } else {
                this.replView.clearInput()
            }
        }

        this.replView.on('historyUp', () => {
            if (this.historyTree === undefined) {
                return
            }

            if (this.state.historyNdx < this.historyTree?.items.length - 1) {
                this.state.historyNdx += 1
            }

            updateReplInput()
        })

        this.replView.on('historyDown', () => {
            if (this.historyTree === undefined) {
                return
            }

            if (this.state.historyNdx >= 0) {
                this.state.historyNdx -= 1
            }

            updateReplInput()
        })
    }

    addReplText(str: string): void {
        this.replView.addText(str)
    }
}
