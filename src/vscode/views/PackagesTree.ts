import { Package } from '../Types'
import { BasePackagesTree, PackagesTreeState } from './BasePackagesTree'

export class PackagesTreeProvider extends BasePackagesTree<Package> {
    constructor(pkgs: Package[], state: PackagesTreeState) {
        super(pkgs, state)
    }

    getItemName(item: Package): string {
        return item.name
    }

    getItemChildren(item: Package): Array<string> {
        return item.exports
    }
}
