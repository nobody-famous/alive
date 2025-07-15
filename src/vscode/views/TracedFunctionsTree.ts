import { TracedPackage } from '../Types'
import { BasePackageTree, PackagesTreeState } from './BasePackageTree'

export class TracedFunctionTreeProvider extends BasePackageTree<TracedPackage> {
    constructor(traced: TracedPackage[], state: PackagesTreeState) {
        super(traced, state)
    }

    getItemName(item: TracedPackage): string {
        return item.name
    }

    getItemChildren(item: TracedPackage): Array<string> {
        return item.traced
    }
}
