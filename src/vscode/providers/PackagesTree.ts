import * as vscode from 'vscode'
import { Package } from '../Types'

export class PackageNode extends vscode.TreeItem {
    constructor(key: string, collapse: vscode.TreeItemCollapsibleState) {
        super(key, collapse)

        this.contextValue = 'package'
    }
}

export class ExportNode extends vscode.TreeItem {
    public pkg: string

    constructor(key: string, pkg: string) {
        super(key, vscode.TreeItemCollapsibleState.None)

        this.pkg = pkg
        this.contextValue = 'export'
    }
}

export class PackagesTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private pkgs: Map<string, Package>
    private event: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem>()

    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this.event.event

    constructor(pkgs: Package[]) {
        this.pkgs = this.buildMap(pkgs)
    }

    private buildMap(pkgs: Package[]) {
        const map = new Map()

        for (const pkg of pkgs) {
            map.set(pkg.name.toLowerCase(), pkg)
        }

        return map
    }

    update(pkgs: Package[]) {
        this.pkgs = this.buildMap(pkgs)
        this.event.fire()
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (element === undefined) {
            const keys = Array.from(this.pkgs.keys()).sort()

            return keys.map((key) => {
                const pkg = this.pkgs.get(key)

                if (pkg === undefined) {
                    return new vscode.TreeItem(key)
                }

                const state =
                    pkg.exports?.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None

                return new PackageNode(key, state)
            })
        }

        if (typeof element.label === 'string') {
            const pkg = this.pkgs.get(element.label)

            return pkg?.exports.sort().map((item) => new ExportNode(item, pkg.name.toLowerCase()))
        }

        return []
    }
}
