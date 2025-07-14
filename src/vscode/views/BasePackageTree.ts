import * as vscode from 'vscode'
import { PackageTreeConfig } from '../../config'
import { isArray, isObject, isString } from '../Guards'

interface TreeNode {
    kids: { [index: string]: TreeNode }
    packageName: string
    label: string
    leafs?: Array<string>
}

function isTreeNode(data: unknown): data is TreeNode {
    return (
        isObject(data) &&
        isObject(data.kids) &&
        isString(data.packageName) &&
        isString(data.label) &&
        (data.exports === undefined || isArray(data.exports, isString))
    )
}

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

export class LeafNode extends vscode.TreeItem {
    public pkg: string

    constructor(key: string, pkg: string) {
        super(key, vscode.TreeItemCollapsibleState.None)

        this.pkg = pkg
        this.contextValue = 'leaf'
    }
}

export function isPackageNode(data: unknown): data is PackageNode {
    return data instanceof PackageNode
}

export function isLeafNode(data: unknown): data is LeafNode {
    return data instanceof LeafNode
}

export interface PackagesTreeState {
    config: {
        packageTree: PackageTreeConfig
    }
}

export abstract class BasePackageTree<T> implements vscode.TreeDataProvider<vscode.TreeItem> {
    private state: PackagesTreeState
    private event: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem>()
    protected rootNode: TreeNode = { kids: {}, packageName: '', label: '' }

    abstract getItemName(item: T): string
    abstract getItemChildren(item: T): Array<string>

    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this.event.event

    constructor(state: PackagesTreeState) {
        this.state = state
    }

    protected fireEvent() {
        this.event.fire()
    }

    protected splitName(name: string) {
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

    protected buildTree(items: T[]) {
        this.rootNode = { kids: {}, label: '', packageName: '' }

        for (const item of items) {
            const name = this.getItemName(item)
            const parts = this.splitName(name)

            let curNode = this.rootNode
            for (const part of parts) {
                const newNode = curNode.kids[part] ?? { label: part, packageName: name, kids: {} }

                curNode.kids[part] = newNode
                curNode = newNode
            }

            curNode.leafs = this.getItemChildren(item)
            curNode.packageName = name
        }
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    private createLeafNodes(parent: TreeNode, nodes: vscode.TreeItem[]): vscode.TreeItem[] {
        if (!isTreeNode(parent)) {
            return nodes
        }

        return isArray(parent.leafs, isString)
            ? nodes.concat(parent.leafs.sort().map((item) => new LeafNode(item, parent.packageName)))
            : nodes
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (element === undefined) {
            return this.convertNodes(this.rootNode.kids)
        } else if (isString(element.label)) {
            if (!isPackageNode(element)) {
                return []
            }

            const kids: vscode.TreeItem[] = this.convertNodes(element.node.kids)

            return this.createLeafNodes(element.node, kids)
        }

        return []
    }

    update(pkgs: T[]) {
        this.buildTree(pkgs)
        this.fireEvent()
    }

    private convertNodes = (nodes: { [index: string]: TreeNode }) => {
        return Object.values(nodes)
            .map((node) => this.toPackageNode(node))
            .sort(this.compareNodes)
    }

    private compareNodes = (a: PackageNode, b: PackageNode) => {
        // Nodes are created from a map, so there's no duplicate labels and they can't be equal
        return a.label < b.label ? -1 : 1
    }

    private toPackageNode = (node: TreeNode) => {
        const hasLeafs = Array.isArray(node.leafs) && node.leafs.length > 0
        const hasKids = Object.keys(node.kids).length > 0
        const state = hasLeafs || hasKids ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None

        return new PackageNode(node.label.toLowerCase(), node, state)
    }
}
