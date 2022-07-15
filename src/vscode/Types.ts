import { ChildProcess } from 'child_process'
import * as vscode from 'vscode'
import { LSP } from './backend/LSP'
import { UI } from './UI'

export interface ExtensionDeps {
    ui: UI
    lsp: LSP
}

export interface ExtensionState {
    ctx: vscode.ExtensionContext
    lspInstallPath?: string
    child?: ChildProcess
    hoverText: string
    compileRunning: boolean
    compileTimeoutID: NodeJS.Timeout | undefined
    replHistoryFile: string
    historyNdx: number
    workspacePath: string
}

export interface AliveLspVersion {
    createdAt: number
    name: string
    tagName: string
    zipballUrl: string
}

export interface HostPort {
    host: string
    port: number
}

export interface CompileLocation {
    file: string
    start: vscode.Position
    end: vscode.Position
}

export interface CompileFileNote {
    message: string
    severity: string
    location: CompileLocation
}

export interface CompileFileResp {
    notes: CompileFileNote[]
}

export interface Package {
    name: string
    exports: Array<string>
    nicknames: Array<string>
}

export interface Thread {
    id: number
    name: string
}

export interface HistoryItem {
    pkgName: string
    text: string
}

export interface RestartInfo {
    name: string
    description: string
}

export interface DebugInfo {
    message: string
    restarts: Array<RestartInfo>
    stackTrace: Array<string>
}

export interface EvalInfo {
    text: string
    package: string
}

export interface InspectResult {
    id: number
    result: unknown
}
