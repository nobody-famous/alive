import { TracedPackage } from '../Types'
import { BasePackagesTree, PackagesTreeState } from './BasePackagesTree'

export class TracedFunctionTreeProvider extends BasePackagesTree<TracedPackage> {
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
