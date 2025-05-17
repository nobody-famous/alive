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
import { isFiniteNumber } from './Guards'
import { PackageTreeConfig } from '../config'

export declare interface UIEvents {
    saveReplHistory: [history: HistoryItem[]]
    eval: [text: string, pkgName: string, storeResult?: boolean]
    inspect: [text: string, pkgName: string]
    inspectClosed: [info: InspectInfo]
    inspectEval: [info: InspectInfo, text: string]
    inspectRefresh: [info: InspectInfo]
    inspectRefreshMacro: [info: InspectInfo]
    inspectMacroInc: [info: InspectInfo]
    listPackages: [fn: (pkgs: Package[]) => void]
    diagnosticsRefresh: [editors: readonly vscode.TextEditor[]]
}

export interface UIState {
    ctx: AliveContext
    extension: Pick<vscode.Extension<unknown>, 'packageJSON'>
    config: { packageTree: PackageTreeConfig }
}

export class UI extends EventEmitter<UIEvents> {
    private state: UIState
    private historyTree: ReplHistoryTreeProvider
    private packageTree: PackagesTreeProvider
    private asdfTree: AsdfSystemsTreeProvider
    private threadsTree: ThreadsTreeProvider
    private replView: LispRepl
    private inspectorPanel: InspectorPanel
    private inspectors: Map<number, Inspector>
    private debugViews: Array<DebugView>
    private queryText: string

    constructor(state: UIState) {
        super()

        this.state = state
        this.historyTree = new ReplHistoryTreeProvider([])
        this.packageTree = new PackagesTreeProvider([], state)
        this.asdfTree = new AsdfSystemsTreeProvider([])
        this.threadsTree = new ThreadsTreeProvider([])
        this.replView = new LispRepl(state.ctx, state.extension.packageJSON.version)
        this.inspectors = new Map()
        this.inspectorPanel = new InspectorPanel(state.ctx)
        this.debugViews = []
        this.queryText = ''
    }

    init() {
        this.initRepl()
        this.initInspectorPanel()
    }

    registerProviders() {
        vscode.window.registerWebviewViewProvider('lispRepl', this.replView)
    }

    clearRepl() {
        this.replView.clear()
    }

    toggleReplWordWrap() {
        this.replView.toggleWordWrap()
    }

    clearReplHistory() {
        this.historyTree.clear()
    }

    setReplPackage(pkg: string) {
        this.replView.setPackage(pkg)
    }

    setReplInput(input: string) {
        this.replView.setInput(input)
    }

    private removeDebugView(view: DebugView) {
        const index = this.debugViews.findIndex((v) => v === view)

        this.debugViews.splice(index, 1)
    }

    async getRestartIndex(info: DebugInfo): Promise<number | undefined> {
        let index: number | undefined = undefined

        return new Promise<number | undefined>((resolve) => {
            const view = new DebugView(this.state.ctx, 'Debug', vscode.ViewColumn.Two, info)

            view.on('restart', (num: number) => {
                if (num < 0 || num >= info.restarts.length) {
                    return
                }

                index = num
                view.stop()
            })

            view.on('debugClosed', () => {
                const num = isFiniteNumber(index)
                    ? index
                    : info.restarts.reduce(
                          (acc: number | undefined, item, ndx) =>
                              typeof acc === 'number' || item.name.toLocaleLowerCase() !== 'abort' ? acc : ndx,
                          undefined
                      )

                view.stop()
                this.removeDebugView(view)

                resolve(isFiniteNumber(num) ? num : undefined)
            })

            view.on('jumpTo', async (file: string, line: number, char: number) => {
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

            this.debugViews.push(view)
            view.run()
        })
    }

    selectRestart(restart: number) {
        const view = this.debugViews.find((v) => v.panel?.visible)

        view?.selectRestart(restart)
    }

    async getUserInput(): Promise<string> {
        const input = await vscode.window.showInputBox({ title: this.queryText })

        return input ?? ''
    }

    updateThreads(threads: Thread[]): void {
        this.threadsTree.update(threads)
    }

    updateAsdfSystems(systems: string[]): void {
        this.asdfTree.update(systems)
    }

    updatePackages(pkgs: Package[]): void {
        this.packageTree.update(pkgs)
    }

    initInspector(): void {
        vscode.window.registerWebviewViewProvider('lispInspector', this.inspectorPanel)
    }

    initPackagesTree(pkgs: Package[]): void {
        this.packageTree.update(pkgs)
        vscode.window.registerTreeDataProvider('lispPackages', this.packageTree)
    }

    initHistoryTree(history: HistoryItem[]): void {
        this.historyTree.update(history)
        vscode.window.registerTreeDataProvider('replHistory', this.historyTree)
    }

    initAsdfSystemsTree(systems: string[]): void {
        this.asdfTree.update(systems)
        vscode.window.registerTreeDataProvider('asdfSystems', this.asdfTree)
    }

    initThreadsTree(threads: Thread[]): void {
        this.threadsTree.update(threads)
        vscode.window.registerTreeDataProvider('lispThreads', this.threadsTree)
    }

    getHistoryItems(): HistoryItem[] {
        return this.historyTree.getItems()
    }

    removeHistoryNode(node: HistoryNode) {
        this.historyTree.removeNode(node)
    }

    moveHistoryNodeToTop(node: HistoryNode) {
        this.historyTree.moveToTop(node)
    }

    selectHistoryItem() {
        return new Promise<HistoryItem | undefined>((resolve) => {
            const items = [...this.historyTree.getItems()]
            const qp = vscode.window.createQuickPick()

            qp.items = items.map<vscode.QuickPickItem>((i) => ({ label: i.text, description: i.pkgName }))

            qp.onDidChangeSelection((e) => {
                const item = e[0]

                if (item === undefined) {
                    return
                }

                const historyItem = { text: item.label, pkgName: item.description ?? '' }

                this.historyTree.moveItemToTop(historyItem)

                resolve(historyItem)

                qp.hide()
            })

            qp.onDidHide(() => {
                qp.dispose()
                resolve(undefined)
            })

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

    private requestPackage = async (obj: { setPackage: (pick: string) => void }) => {
        const pick = await this.selectPackage()

        if (pick !== undefined) {
            obj.setPackage(pick)
        }
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
        const inspector = new Inspector(this.state.ctx.extensionPath, vscode.ViewColumn.Two, info)

        this.inspectors.set(info.id, inspector)

        inspector.on('inspectorClosed', () => {
            this.inspectors.delete(info.id)
            this.emit('inspectClosed', info)
        })
        inspector.on('inspectorEval', (text: string) => this.emit('inspectEval', info, text))
        inspector.on('inspectorRefresh', () => this.emit('inspectRefresh', info))
        inspector.on('inspectorRefreshMacro', () => this.emit('inspectRefreshMacro', info))
        inspector.on('inspectorMacroInc', () => this.emit('inspectMacroInc', info))

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

    initInspectorPanel() {
        this.inspectorPanel.on('inspect', async (pkg: string, text: string) => this.emit('inspect', text, pkg))

        this.inspectorPanel.on('requestPackage', async () => {
            await this.requestPackage(this.inspectorPanel)
        })
    }

    async initRepl() {
        this.replView.on('eval', async (pkg: string, text: string) => {
            this.historyTree.removeItem(pkg, text)
            this.historyTree.addItem(pkg, text)

            this.emit('saveReplHistory', this.historyTree.getItems())
            this.emit('eval', text, pkg, true)
        })

        this.replView.on('requestPackage', async () => {
            await this.requestPackage(this.replView)
        })

        const updateReplInputWithHistory = () => {
            const historyItem = this.historyTree.getCurrentItem()

            if (historyItem !== undefined) {
                this.replView.setInput(historyItem.text)
            } else {
                this.replView.clearInput()
            }
        }

        this.replView.on('historyUp', () => {
            this.historyTree.incrementIndex()
            updateReplInputWithHistory()
        })

        this.replView.on('historyDown', () => {
            this.historyTree.decrementIndex()
            updateReplInputWithHistory()
        })
    }

    addReplOutput(str: string, pkgName?: string): void {
        this.replView.addOutput(str, pkgName)
    }

    setQueryText(str: string): void {
        this.queryText = str
    }
}
