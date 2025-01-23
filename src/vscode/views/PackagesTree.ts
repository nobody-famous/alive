import * as vscode from 'vscode'
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

export class PackagesTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private event: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem>()
    private rootNode: TreeNode = { kids: {}, label: '', packageName: '' }

    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this.event.event

    constructor(pkgs: Package[]) {
        this.buildTree(pkgs)
    }

    private buildTree(pkgs: Package[]) {
        this.rootNode = { kids: {}, label: '', packageName: '' }

        for (const pkg of pkgs) {
            const parts = pkg.name.split('/')

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

            return isArray(element.node.exports, isString)
                ? element.node.exports.sort().map((item) => new ExportNode(item, element.node.packageName))
                : Object.values(element.node.kids)
                      .map((node) => this.treeToNode(node))
                      .sort(this.compareNodes)
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
