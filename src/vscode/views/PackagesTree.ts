import * as vscode from 'vscode'
import { PackageTreeConfig } from '../../config'
import { isArray, isString } from '../Guards'
import { Package } from '../Types'

export class PackageNode extends vscode.TreeItem {
    public label: string
    public node: TreeNode

    constructor(key: string, node: TreeNode, collapse: vscode.TreeItemCollapsibleState) {
        super(key, collapse)

        this.label = key
        this.node = node
        this.contextValue = 'package'
    }
}

export function isPackageNode(data: unknown): data is PackageNode {
    return data instanceof PackageNode
}

export class ExportNode extends vscode.TreeItem {
    public pkg: string

    constructor(key: string, pkg: string) {
        super(key, vscode.TreeItemCollapsibleState.None)

        this.pkg = pkg
        this.contextValue = 'export'
    }
}

export function isExportNode(data: unknown): data is ExportNode {
    return data instanceof ExportNode
}

interface TreeNode {
    kids: { [index: string]: TreeNode }
    packageName: string
    label: string
    exports?: Array<string>
}

interface PackagesTreeState {
    config: {
        packageTree: PackageTreeConfig
    }
}

export class PackagesTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private state: PackagesTreeState
    private event: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem>()
    private rootNode: TreeNode = { kids: {}, label: '', packageName: '' }

    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this.event.event

    constructor(pkgs: Package[], state: PackagesTreeState) {
        this.state = state
        this.buildTree(pkgs)
    }

    private splitName(name: string) {
        const sep = this.state.config.packageTree.separator

        if (isString(sep)) {
            return name.split(sep)
        }

        if (isArray(sep, isString)) {
            for (const candidate of sep) {
                const parts = name.split(candidate)
                if (parts.length > 1) {
                    return parts
                }
            }
        }

        return [name]
    }

    private buildTree(pkgs: Package[]) {
        this.rootNode = { kids: {}, label: '', packageName: '' }

        for (const pkg of pkgs) {
            const parts = this.splitName(pkg.name)

            let curNode = this.rootNode
            for (const part of parts) {
                const newNode = curNode.kids[part] ?? { label: part, packageName: pkg.name, kids: {} }

                curNode.kids[part] = newNode
                curNode = newNode
            }

            curNode.exports = pkg.exports
            curNode.packageName = pkg.name
        }
    }

    update(pkgs: Package[]) {
        this.buildTree(pkgs)
        this.event.fire()
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (element === undefined) {
            return Object.values(this.rootNode.kids)
                .map((node) => this.treeToNode(node))
                .sort(this.compareNodes)
        } else if (isString(element.label)) {
            if (!isPackageNode(element)) {
                return []
            }

            const kids: vscode.TreeItem[] = Object.values(element.node.kids)
                .map((node) => this.treeToNode(node))
                .sort(this.compareNodes)

            return isArray(element.node.exports, isString)
                ? kids.concat(element.node.exports.sort().map((item) => new ExportNode(item, element.node.packageName)))
                : kids
        }

        return []
    }

    private compareNodes = (a: PackageNode, b: PackageNode) => {
        // Nodes are created from a map, so there's no duplicate labels and they can't be equal
        return a.label < b.label ? -1 : 1
    }

    private treeToNode = (treeNode: TreeNode) => {
        const hasExports = isArray(treeNode.exports, isString) && treeNode.exports.length > 0
        const hasKids = Object.keys(treeNode.kids).length > 0
        const state = hasExports || hasKids ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None

        return new PackageNode(treeNode.label.toLowerCase(), treeNode, state)
    }
}
