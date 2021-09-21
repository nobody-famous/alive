import { ChildProcess } from 'child_process'
import { PackageMgr } from './PackageMgr'
import { Repl } from './repl'

export interface ExtensionState {
    child?: ChildProcess
    repl?: Repl
    slimeBasePath?: string
    pkgMgr: PackageMgr
    hoverText: string
}

export interface SlimeVersion {
    created_at: string
    name: string
    zipball_url: string
}

export interface InstalledSlimeInfo {
    path: string
    latest: SlimeVersion | undefined
}
