import * as vscode from 'vscode'

class DataItem {}

export class LispTreeProvider implements vscode.TreeDataProvider<DataItem> {
    getTreeItem(element: DataItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(element?: DataItem): vscode.ProviderResult<DataItem[]> {
        return []
    }
}
