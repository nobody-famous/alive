import { PackageMgr } from './PackageMgr'
import { Repl } from './repl'

export interface ExtensionState {
    repl?: Repl
    pkgMgr: PackageMgr
    hoverText: string
}
