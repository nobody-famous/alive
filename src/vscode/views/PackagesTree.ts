import { Package } from '../Types'
import { BasePackageTree, PackagesTreeState } from './BasePackageTree'

export class PackagesTreeProvider extends BasePackageTree<Package> {
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
