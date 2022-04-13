import * as vscode from 'vscode'
import { Thread } from '../Types'

export class ThreadsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private threads: Array<Thread>

    constructor(threads: Array<Thread>) {
        this.threads = threads
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        return this.threads.map((thread) => new vscode.TreeItem(thread.name))
    }
}
