import * as vscode from 'vscode'
import { Thread } from '../Types'

export class ThreadNode extends vscode.TreeItem {
    public thread: Thread

    constructor(thread: Thread) {
        super(thread.name)

        this.thread = thread
    }
}

export class ThreadsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private threads: Array<Thread>
    private event: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem>()

    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this.event.event

    constructor(threads: Array<Thread>) {
        this.threads = threads
    }

    update(threads: Thread[]) {
        this.threads = threads
        this.event.fire()
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
        return this.threads.map((thread) => new ThreadNode(thread))
    }
}
