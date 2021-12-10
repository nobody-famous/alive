import * as vscode from 'vscode'
import { ChildProcess } from 'child_process'
import { PackageMgr } from './PackageMgr'
import { Repl } from './repl'

export interface ExtensionState {
    child?: ChildProcess
    backend?: Backend
    hoverText: string
    compileRunning: boolean
    compileTimeoutID: NodeJS.Timeout | undefined
}

export interface LSPBackendState {}

export interface SwankBackendState {
    extState: ExtensionState
    ctx: vscode.ExtensionContext
    repl?: Repl
    slimeBasePath?: string
    pkgMgr: PackageMgr
}

/**
 * Interface used for the backend that the extension is connected to
 */
export interface Backend {
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
     * Disconnect from the backend
     */
    disconnect(): Promise<void>

    /**
     * Action to take when a text document is saved
     * @param doc The text document that was saved
     */
    textDocumentSaved(doc: vscode.TextDocument): Promise<void>

    /**
     * Action to take when a text document is changed
     * @param event The change event
     */
    textDocumentChanged(event: vscode.TextDocumentChangeEvent): void

    /**
     * Get the package name for the given line in the given document
     * @param doc The text document
     * @param line The line in the document
     */
    getPkgName(doc: vscode.TextDocument, line: number): string

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
