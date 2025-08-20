import { TracedPackage } from '../Types'
import { BasePackagesTree, PackagesTreeState } from './BasePackagesTree'

export class TracedFunctionTreeProvider extends BasePackagesTree<TracedPackage> {
    constructor(traced: TracedPackage[], state: PackagesTreeState) {
        super('tracedPackage', 'tracedFunction', traced, state, false)
    }

    getItemName(item: TracedPackage): string {
        return item.name
    }

    getItemChildren(item: TracedPackage): Array<string> {
        return item.traced
    }

    listPackages(): Array<string> {
        return Object.keys(this.rootNode.kids)
    }
}
