import * as vscode from 'vscode'
import { ChildProcess } from 'child_process'
import { PackageMgr } from './PackageMgr'
import { Repl } from './repl'

export interface ExtensionState {
    child?: ChildProcess
    hoverText: string
    compileRunning: boolean
}

export interface LSPBackendState extends ExtensionState {}

export interface SwankBackendState extends ExtensionState {
    repl?: Repl
    slimeBasePath?: string
    pkgMgr: PackageMgr
}

export interface Backend {
    isConnected(): boolean
    saveTextDocument(doc: vscode.TextDocument): Promise<void>
    changeTextDocument(event: vscode.TextDocumentChangeEvent): void
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
