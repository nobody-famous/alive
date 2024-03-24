import { ChildProcess } from 'child_process'
import * as vscode from 'vscode'
import { AliveConfig } from '../config'

export interface AliveContext {
    subscriptions: { dispose: () => unknown }[]
    extensionPath: string
}

export interface ExtensionState {
    ctx: AliveContext
    config: AliveConfig
    diagnostics: vscode.DiagnosticCollection
    lspInstallPath?: string
    child?: ChildProcess
    hoverText: string
    compileRunning: boolean
    compileTimeoutID: NodeJS.Timeout | undefined
    replHistoryFile: string
    workspacePath: string
}

export interface GitHubVersion {
    created_at: string
    name: string
    tag_name: string
    zipball_url: string
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
    id: string
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

export interface SourceLocation {
    function: string
    file: string | null
    position: vscode.Position | null
}

export interface DebugInfo {
    message: string
    restarts: Array<RestartInfo>
    stackTrace: Array<SourceLocation>
}

export interface EvalInfo {
    text: string
    package: string
}

export interface MacroInfo {
    range: vscode.Range
    text: string
    package: string
}

export interface InspectResult {
    id: number
    resultType: string
    result: unknown
}

export interface InspectInfo extends InspectResult {
    text: string
    package: string
}

export interface LispSymbol {
    name: string
    package: string
}
