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
    public items: Array<HistoryItem>
    private event: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem>()

    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this.event.event

    constructor(items: Array<HistoryItem>) {
        this.items = items
    }

    update(items: HistoryItem[]) {
        this.items = items
        this.event.fire()
    }

    clear() {
        this.update([])
    }

    addItem(pkgName: string, text: string) {
        const newItems = [...this.items]

        newItems.unshift({ pkgName, text })
        this.update(newItems)
    }

    removeItem(ndx: number) {
        this.items.splice(ndx, 1)
        this.update(this.items)
    }

    removeNode(node: HistoryNode) {
        let ndx = 0

        while (ndx < this.items.length && this.items[ndx] !== node.item) {
            ndx += 1
        }

        this.removeItem(ndx)
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
