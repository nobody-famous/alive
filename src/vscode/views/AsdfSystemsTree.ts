import * as vscode from 'vscode'

export class AsdfSystemsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private systems: Array<string>
    private event: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem>()

    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this.event.event

    constructor(systems: string[]) {
        this.systems = systems
    }

    update(systems: string[]) {
        this.systems = systems
        this.event.fire()
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        return element === undefined
            ? this.systems.sort().map((sys) => new vscode.TreeItem(sys, vscode.TreeItemCollapsibleState.None))
            : []
    }
}
