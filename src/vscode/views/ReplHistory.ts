import * as vscode from 'vscode'
import { HistoryItem } from '../Types'

export class HistoryNode extends vscode.TreeItem {
    public item: HistoryItem

    constructor(item: HistoryItem) {
        super(item.text, vscode.TreeItemCollapsibleState.Collapsed)

        this.item = item
        this.contextValue = 'evalText'
    }
}

export class HistoryPkgNode extends vscode.TreeItem {
    public pkg: string

    constructor(pkg: string) {
        super(pkg)

        this.pkg = pkg
    }
}

export class ReplHistoryTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private items: Array<HistoryItem>
    private currentIndex: number
    private event: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem>()

    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this.event.event

    constructor(items: Array<HistoryItem>) {
        this.items = items
        this.currentIndex = -1
    }

    update(items: HistoryItem[]) {
        this.items = items
        this.event.fire()
    }

    getItems(): Array<HistoryItem> {
        return this.items
    }

    getCurrentItem(): HistoryItem | undefined {
        return this.items.length > 0 && this.currentIndex >= 0 ? this.items[this.currentIndex] : undefined
    }

    incrementIndex() {
        if (this.currentIndex < this.items.length - 1) {
            this.currentIndex += 1
        }
    }

    decrementIndex() {
        if (this.currentIndex >= 0) {
            this.currentIndex -= 1
        }
    }

    clearIndex() {
        this.currentIndex = -1
    }

    clear() {
        this.update([])
        this.clearIndex()
    }

    addItem(pkgName: string, text: string) {
        const newItems = [...this.items]

        newItems.unshift({ pkgName, text })
        this.update(newItems)
    }

    removeItem(pkg: string, text: string) {
        for (let ndx = 0; ndx < this.items.length; ndx += 1) {
            const item = this.items[ndx]

            if (item !== undefined && item.pkgName === pkg && item.text === text) {
                this.removeItemAtIndex(ndx)
            }
        }
    }

    removeItemAtIndex(ndx: number) {
        this.items.splice(ndx, 1)
        this.update(this.items)
    }

    removeNode(node: HistoryNode) {
        let ndx = 0

        while (ndx < this.items.length && this.items[ndx] !== node.item) {
            ndx += 1
        }

        this.removeItemAtIndex(ndx)
    }

    moveToTop(node: HistoryNode) {
        const newItems = this.items.filter((item) => item !== node.item)

        newItems.unshift(node.item)
        this.update(newItems)
    }

    moveItemToTop(toMove: HistoryItem) {
        const newItems = this.items.filter((item) => item.text !== toMove.text || item.pkgName !== toMove.pkgName)

        newItems.unshift(toMove)
        this.update(newItems)
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (!(element instanceof HistoryNode)) {
            return this.items.map((item) => new HistoryNode(item))
        }

        return [new HistoryPkgNode(element.item.pkgName)]
    }
}
