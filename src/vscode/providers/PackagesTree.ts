import * as vscode from 'vscode'
import { Package } from '../Types'

export class PackagesTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private pkgs: Map<string, Package>

    constructor(pkgs: Package[]) {
        this.pkgs = new Map()

        for (const pkg of pkgs) {
            this.pkgs.set(pkg.name.toLowerCase(), pkg)
        }
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

                return new vscode.TreeItem(key, state)
            })
        }

        if (typeof element.label === 'string') {
            const pkg = this.pkgs.get(element.label)

            return pkg?.exports.sort().map((item) => new vscode.TreeItem(item))
        }

        return []
    }
}
