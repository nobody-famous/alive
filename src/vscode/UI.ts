import EventEmitter = require('events')
import * as vscode from 'vscode'
import { PackagesTreeProvider, ThreadsTreeProvider } from './providers'
import { AsdfSystemsTreeProvider } from './providers/AsdfSystemsTree'
import { getHoverProvider } from './providers/Hover'
import { LispRepl } from './providers/LispRepl'
import { ReplHistoryTreeProvider } from './providers/ReplHistory'
import { DebugView } from './repl'
import { DebugInfo, ExtensionState, HistoryItem, Package, Thread, UIListener } from './Types'
import { COMMON_LISP_ID } from './Utils'

export declare interface UI {
    on(event: 'saveReplHistory', listener: (history: HistoryItem[]) => void): this
}

export class UI extends EventEmitter {
    private state: ExtensionState
    private packageTree: PackagesTreeProvider | undefined
    private historyTree: ReplHistoryTreeProvider | undefined
    private asdfTree: AsdfSystemsTreeProvider | undefined
    private threadsTree: ThreadsTreeProvider | undefined
    private replView: LispRepl
    private listener: UIListener | undefined

    constructor(state: ExtensionState) {
        super()

        this.state = state
        this.replView = new LispRepl(state.ctx)

        vscode.window.registerWebviewViewProvider('lispRepl', this.replView)
        vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider(state))
    }

    clearRepl() {
        this.replView.clear()
    }

    setReplPackage(pkg: string) {
        this.replView.setPackage(pkg)
    }

    setReplInput(input: string) {
        this.replView.setInput(input)
    }

    setListener(listener: UIListener) {
        this.listener = listener
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

    async initRepl(replHistoryFile?: string) {
        this.replView.on('eval', async (pkg: string, text: string) => {
            if (this.state.historyNdx >= 0) {
                const item = this.historyTree?.items[this.state.historyNdx]

                if (item !== undefined && item.pkgName === pkg && item.text === text) {
                    this.historyTree?.removeItem(this.state.historyNdx)
                }
            }

            this.historyTree?.addItem(pkg, text)

            if (replHistoryFile !== undefined && this.historyTree !== undefined) {
                this.emit('saveReplHistory', this.historyTree.items)
            }

            this.state.historyNdx = -1
            await this.listener?.eval(text, pkg, true)
        })

        this.replView.on('requestPackage', async () => {
            const pkgs = (await this.listener?.listPackages()) ?? []
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
        console.log('ADD REPL TEXT', str)
        this.replView.addText(str)
    }
}
