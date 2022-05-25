import EventEmitter = require('events')
import * as vscode from 'vscode'
import { PackagesTreeProvider, ThreadsTreeProvider } from './providers'
import { AsdfSystemsTreeProvider } from './providers/AsdfSystemsTree'
import { getHoverProvider } from './providers/Hover'
import { LispRepl } from './providers/LispRepl'
import { HistoryNode, ReplHistoryTreeProvider } from './providers/ReplHistory'
import { DebugView } from './repl'
import { DebugInfo, ExtensionState, HistoryItem, Package, Thread } from './Types'
import { COMMON_LISP_ID } from './Utils'

export declare interface UI {
    on(event: 'saveReplHistory', listener: (history: HistoryItem[]) => void): this
    on(event: 'eval', listener: (text: string, pkgName: string, storeResult?: boolean) => void): this
    on(event: 'listPackages', listener: (fn: (pkgs: Package[]) => void) => void): this
}

export class UI extends EventEmitter {
    private state: ExtensionState
    private packageTree: PackagesTreeProvider | undefined
    private historyTree: ReplHistoryTreeProvider | undefined
    private asdfTree: AsdfSystemsTreeProvider | undefined
    private threadsTree: ThreadsTreeProvider | undefined
    private replView: LispRepl

    constructor(state: ExtensionState) {
        super()

        this.state = state
        this.replView = new LispRepl(state.ctx)

        this.initRepl()

        vscode.window.registerWebviewViewProvider('lispRepl', this.replView)
        vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider(state))
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
        return new Promise<number>((resolve, reject) => {
            if (this.state.ctx === undefined) {
                return reject('Debugger: No extension context')
            }

            const view = new DebugView(this.state.ctx, 'Debug', vscode.ViewColumn.Two, info)

            view.on('restart', (num: number) => {
                view.stop()
                resolve(num)
            })

            view.run()
        })
    }

    async getUserInput(): Promise<string> {
        const input = await vscode.window.showInputBox()

        return input !== undefined ? `${input}\n` : '\n'
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
        return new Promise<HistoryItem>((resolve, reject) => {
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

        const requestPackages = () => {
            return new Promise<Package[]>((resolve, reject) => {
                this.emit('listPackages', (pkgs: Package[]) => {
                    resolve(pkgs)
                })
            })
        }

        this.replView.on('requestPackage', async () => {
            const pkgs = await requestPackages()
            const names: string[] = []

            for (const pkg of pkgs) {
                names.push(pkg.name.toLowerCase())

                for (const nick of pkg.nicknames) {
                    names.push(nick.toLowerCase())
                }
            }

            const pick = await vscode.window.showQuickPick(names.sort(), { placeHolder: 'Select Package' })

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
