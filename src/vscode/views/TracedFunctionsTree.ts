import * as vscode from 'vscode'

export class TracedFunctionTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private names: Array<string>
    private event: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem>()

    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this.event.event

    constructor(names: string[]) {
        this.names = names
    }

    update(names: string[]) {
        this.names = names
        this.event.fire()
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        return element === undefined
            ? this.names.sort().map((name) => new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None))
            : []
    }
}
