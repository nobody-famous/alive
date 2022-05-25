import { ChildProcess } from 'child_process'
import * as vscode from 'vscode'
import { PackagesTreeProvider, ThreadsTreeProvider } from './providers'
import { AsdfSystemsTreeProvider } from './providers/AsdfSystemsTree'
import { ReplHistoryTreeProvider } from './providers/ReplHistory'

export interface BackendListener {
    getRestartIndex(info: DebugInfo): Promise<number | undefined>
    getUserInput(): Promise<string>
    sendOutput(str: string): void
}

export interface UIListener {
    saveReplHistory(items: HistoryItem[]): Promise<void>
    eval(text: string, pkgName: string, storeResult?: boolean): Promise<void>
    listPackages(): Promise<Package[]>
}

export interface UI {
    getRestartIndex(info: DebugInfo): Promise<number | undefined>
    getUserInput(): Promise<string>
    addReplText(str: string): void

    initPackagesTree(pkgs: Package[]): void
    initHistoryTree(history: HistoryItem[]): void
    initAsdfSystemsTree(systems: string[]): void
    initThreadsTree(threads: Thread[]): void
}

export interface ExtensionState {
    ctx: vscode.ExtensionContext
    child?: ChildProcess
    backend?: Backend
    hoverText: string
    compileRunning: boolean
    compileTimeoutID: NodeJS.Timeout | undefined
    packageTree?: PackagesTreeProvider
    asdfTree?: AsdfSystemsTreeProvider
    threadTree?: ThreadsTreeProvider
    historyTree?: ReplHistoryTreeProvider
    historyNdx: number
}

/**
 * Interface used for the backend that the extension is connected to
 */
export interface Backend {
    setListener(listener: BackendListener): void

    inlineEval(editor: vscode.TextEditor | undefined): Promise<void>

    eval(text: string, pkgName: string, storeResult?: boolean): Promise<void>

    listAsdfSystems(): Promise<string[]>

    listPackages(): Promise<Package[]>

    listThreads(): Promise<Thread[]>

    loadAsdfSystem(name: string): Promise<CompileFileResp | undefined>

    loadFile(path: string, showMsgs?: boolean): Promise<void>

    compileFile(path: string, ignoreOutput?: boolean): Promise<CompileFileResp | undefined>

    editorChanged(editor?: vscode.TextEditor): void

    /**
     * Action to take when a text document is changed
     * @param event The change event
     */
    textDocumentChanged(event: vscode.TextDocumentChangeEvent): void

    /**
     * Check if the backend is currently connected
     */
    isConnected(): boolean

    /**
     * Connect to the given host and port
     * @param hostPort The HostPort pair to connect to
     */
    connect(hostPort: HostPort): Promise<void>

    /**
     * Send the given text to the REPL for evaluation
     * @param editor The REPL editor buffer
     * @param text The text to send
     * @param pkgName The package name to evaluate the text in
     * @param captureOutput Whether to capture output
     */
    sendToRepl(editor: vscode.TextEditor, text: string, pkgName: string, captureOutput: boolean): Promise<void>
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

export interface DebugInfo {
    message: string
    restarts: Array<string>
    stackTrace: Array<string>
}
