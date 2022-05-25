import EventEmitter = require('events')
import { Backend, BackendListener, DebugInfo, HistoryItem, Package, UI, UIListener } from './Types'

export class ExtensionController extends EventEmitter implements BackendListener, UIListener {
    private be: Backend
    private ui: UI

    constructor(be: Backend, ui: UI) {
        super()

        this.be = be
        this.ui = ui

        this.be.setListener(this)
    }

    async getUserInput(): Promise<string> {
        return this.ui.getUserInput()
    }

    sendOutput(str: string): void {
        this.ui.addReplText(str)
    }

    async getRestartIndex(info: DebugInfo): Promise<number | undefined> {
        return this.ui.getRestartIndex(info)
    }

    async eval(text: string, pkgName: string, storeResult?: boolean): Promise<void> {
        await this.be.eval(text, pkgName, storeResult)
    }

    async listPackages(): Promise<Package[]> {
        return this.be.listPackages()
    }

    async saveReplHistory(items: HistoryItem[]): Promise<void> {
        this.emit('saveHistory', items)
    }

    async initTreeViews(history: HistoryItem[]) {
        const pkgs = await this.be.listPackages()
        const systems = await this.be.listAsdfSystems()
        const threads = await this.be.listThreads()

        this.ui.initPackagesTree(pkgs)
        this.ui.initHistoryTree(history)
        this.ui.initAsdfSystemsTree(systems)
        this.ui.initThreadsTree(threads)
    }
}
