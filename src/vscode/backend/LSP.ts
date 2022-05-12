import * as vscode from 'vscode'
import * as net from 'net'
import { Backend, CompileFileNote, CompileFileResp, CompileLocation, HostPort, LSPBackendState, Package, Thread } from '../Types'
import { COMMON_LISP_ID, hasValidLangId, startCompileTimer } from '../Utils'
import { LanguageClient, LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node'
import EventEmitter = require('events')
import { refreshPackages, refreshThreads } from '../commands'

const parseToInt = (data: unknown): number | undefined => {
    if (typeof data !== 'string' && typeof data !== 'number') {
        return
    }

    const int = typeof data === 'string' ? parseInt(data) : data

    return Number.isFinite(int) ? int : undefined
}

const parsePos = (data: unknown): vscode.Position | undefined => {
    if (typeof data !== 'object' || data === null) {
        return
    }

    const dataObj = data as { [index: string]: unknown }
    const line = parseToInt(dataObj.line)
    const col = parseToInt(dataObj.col)

    if (line === undefined || col === undefined) {
        return
    }

    return new vscode.Position(line, col)
}

export class LSP extends EventEmitter implements Backend {
    private state: LSPBackendState
    public defaultPort: number = 25483
    private client: LanguageClient | undefined

    constructor(state: LSPBackendState) {
        super()

        this.state = state
    }

    async connect(hostPort: HostPort): Promise<void> {
        const serverOpts: () => Promise<StreamInfo> = () => {
            return new Promise((resolve, reject) => {
                const socket: net.Socket = net.connect({ port: hostPort.port, host: hostPort.host }, () =>
                    resolve({ reader: socket, writer: socket })
                )

                socket.on('error', (err) => reject(err))
            })
        }
        const clientOpts: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: COMMON_LISP_ID },
                { scheme: 'untitled', language: COMMON_LISP_ID },
            ],
        }

        this.client = new LanguageClient(COMMON_LISP_ID, 'Alive Client', serverOpts, clientOpts)

        this.client.start()

        await this.client.onReady()
        this.client.onNotification('$/alive/stderr', (params) => {
            this.emit('output', params.data)
        })
        this.client.onNotification('$/alive/stdout', (params) => {
            this.emit('output', params.data)
        })
    }

    async inspector(text: string, pkgName: string): Promise<void> {}

    async inspectorPrev(): Promise<void> {}

    async inspectorNext(): Promise<void> {}

    async inspectorRefresh(): Promise<void> {}

    async inspectorQuit(): Promise<void> {}

    async addToReplView(text: string): Promise<void> {}

    async inlineEval(text: string, pkgName: string): Promise<string | undefined> {
        return
    }

    async eval(text: string, pkgName: string, storeResult?: boolean): Promise<string | undefined> {
        try {
            const promise = this.client?.sendRequest('$/alive/eval', { text, package: pkgName, storeResult })

            refreshThreads(this.state.extState)

            const resp = await promise

            if (typeof resp !== 'object') {
                return
            }

            const resultObj = resp as { text: string }

            if (resultObj.text !== undefined) {
                this.emit('output', resultObj.text)
            }
        } catch (err) {
            const errObj = err as { message: string }

            if (errObj.message !== undefined) {
                this.emit('output', errObj.message)
            } else {
                this.emit('output', JSON.stringify(err))
            }
        } finally {
            refreshThreads(this.state.extState)
        }

        return
    }

    replDebugAbort(): void {}

    async macroExpand(text: string, pkgName: string): Promise<string | undefined> {
        return
    }

    async macroExpandAll(text: string, pkgName: string): Promise<string | undefined> {
        return
    }

    async disassemble(text: string, pkgName: string): Promise<string | undefined> {
        return
    }

    async listAsdfSystems(): Promise<string[]> {
        const resp = await this.client?.sendRequest('$/alive/listAsdfSystems')
        const respObj = resp as { systems: Array<string> }

        if (respObj.systems === undefined) {
            return []
        }

        const systems: string[] = []

        for (const sys of respObj.systems) {
            if (typeof sys === 'string') {
                systems.push(sys)
            }
        }

        return systems
    }

    async listPackages(): Promise<Package[]> {
        const resp = await this.client?.sendRequest('$/alive/listPackages')
        const respObj = resp as { packages: Array<{ name: string; exports: Array<string> }> }

        if (respObj.packages === undefined) {
            return []
        }

        const pkgs: Package[] = []

        for (const obj of respObj.packages) {
            const pkgObj = obj as Package

            if (pkgObj.name === undefined || pkgObj.exports === undefined || pkgObj.nicknames === undefined) {
                continue
            }

            if (pkgObj.nicknames === undefined || pkgObj.nicknames === null) {
                pkgObj.nicknames = []
            }

            pkgs.push(pkgObj)
        }

        return pkgs
    }

    async killThread(thread: Thread): Promise<void> {
        await this.client?.sendRequest('$/alive/killThread', { id: thread.id })
        await refreshThreads(this.state.extState)
    }

    async listThreads(): Promise<Thread[]> {
        const resp = await this.client?.sendRequest('$/alive/listThreads')
        const respObj = resp as { threads: Array<Thread> }

        if (typeof respObj !== 'object' || respObj.threads === undefined || !Array.isArray(respObj.threads)) {
            return []
        }

        const threads: Thread[] = []

        for (const item of respObj.threads) {
            const itemObj = item as Thread

            if (itemObj.id === undefined || itemObj.name === undefined) {
                continue
            }

            threads.push(itemObj)
        }

        return threads
    }

    async compileAsdfSystem(name: string): Promise<CompileFileResp | undefined> {
        return
    }

    async loadAsdfSystem(name: string): Promise<CompileFileResp | undefined> {
        await this.client?.sendRequest('$/alive/loadAsdfSystem', { name })
        return
    }

    async loadFile(path: string, showMsgs?: boolean): Promise<void> {
        try {
            const promise = this.client?.sendRequest('$/alive/loadFile', { path, showStdout: true, showStderr: true })

            refreshThreads(this.state.extState)

            const resp = await promise
            if (typeof resp !== 'object') {
                return
            }

            const respObj = resp as { [index: string]: unknown }

            if (!Array.isArray(respObj.messages)) {
                return
            }

            for (const msg of respObj.messages) {
                if (typeof msg !== 'object') {
                    continue
                }

                const msgObj = msg as { [index: string]: unknown }

                if (typeof msgObj.severity !== 'string' || typeof msgObj.message !== 'string') {
                    continue
                }

                this.emit('output', `${msgObj.severity.toUpperCase()}: ${msgObj.message}`)
            }
        } catch (err) {
            const errObj = err as { message: string }

            if (errObj.message !== undefined) {
                this.emit('output', errObj.message)
            } else {
                this.emit('output', JSON.stringify(err))
            }
        } finally {
            refreshThreads(this.state.extState)
        }
    }

    textDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
        if (!hasValidLangId(event.document, [COMMON_LISP_ID])) {
            return
        }

        startCompileTimer(this.state.extState)
    }

    editorChanged(editor?: vscode.TextEditor): void {
        if (editor === undefined || !hasValidLangId(editor.document, [COMMON_LISP_ID])) {
            return
        }

        startCompileTimer(this.state.extState)
    }

    async compileFile(path: string): Promise<CompileFileResp | undefined> {
        const resp = await this.client?.sendRequest('$/alive/tryCompile', { path })

        if (typeof resp !== 'object' || resp === null) {
            return { notes: [] }
        }

        const respObj = resp as { [index: string]: unknown }

        if (!Array.isArray(respObj.messages)) {
            return { notes: [] }
        }

        const parseLocation = (data: unknown): CompileLocation | undefined => {
            if (typeof data !== 'object' || data === null) {
                return
            }

            const dataObj = data as { [index: string]: unknown }
            const start = parsePos(dataObj.start)
            const end = parsePos(dataObj.end)

            if (start === undefined || end === undefined) {
                return
            }

            return { file: path, start, end }
        }

        const parseNote = (data: unknown): CompileFileNote | undefined => {
            if (typeof data !== 'object' || data === null) {
                return
            }

            const dataObj = data as { [index: string]: unknown }
            const msg = typeof dataObj.message === 'string' ? dataObj.message : ''
            const sev = typeof dataObj.severity === 'string' ? dataObj.severity : ''
            const loc = parseLocation(dataObj.location)

            if (loc === undefined) {
                return
            }

            return {
                message: msg,
                severity: sev,
                location: loc,
            }
        }

        const notes: CompileFileNote[] = []
        const seen: { [index: string]: true } = {}

        for (const item of respObj.messages) {
            const note = parseNote(item)

            if (note !== undefined && seen[note.message] === undefined) {
                seen[note.message] = true
                notes.push(note)
            }
        }

        return { notes }
    }

    async getSymbolDoc(text: string, pkgName: string): Promise<string | undefined> {
        return
    }

    async getOpArgs(name: string, pkgName: string): Promise<string | undefined> {
        return
    }

    isConnected(): boolean {
        return this.client !== undefined
    }

    async disconnect(): Promise<void> {}

    getPkgName(doc: vscode.TextDocument, line: number): string {
        return ''
    }

    async sendToRepl(editor: vscode.TextEditor | undefined) {
        if (editor === undefined) {
            return
        }

        const range = editor.selection.isEmpty
            ? await this.getTopExprRange(editor)
            : new vscode.Range(editor.selection.start, editor.selection.end)

        if (range === undefined) {
            return
        }

        const text = editor.document.getText(range)
        const pkg = await this.getPackage(editor, range.start)

        if (text !== undefined && pkg !== undefined) {
            await vscode.workspace.saveAll()
            await this.eval(text, pkg)
        }
    }

    async getPackage(editor: vscode.TextEditor, pos: vscode.Position): Promise<string | undefined> {
        const doc = editor.document
        const resp = await this.client?.sendRequest('$/alive/getPackageForPosition', {
            textDocument: {
                uri: doc.uri.toString(),
            },
            position: pos,
        })

        if (typeof resp !== 'object' || resp === null) {
            return
        }

        const respObj = resp as { package: string }

        return respObj.package
    }

    async removePackage(name: string): Promise<void> {
        await this.client?.sendRequest('$/alive/removePackage', {
            name,
        })

        await refreshPackages(this.state.extState)
    }

    async removeExport(pkg: string, name: string): Promise<void> {
        await this.client?.sendRequest('$/alive/unexportSymbol', {
            package: pkg,
            symbol: name,
        })

        await refreshPackages(this.state.extState)
    }

    async replNthRestart(restart: number): Promise<void> {}

    async installServer(): Promise<void> {}

    serverInstallPath(): string | undefined {
        return
    }

    serverStartupCommand(): string[] | undefined {
        return
    }

    async getTopExprRange(editor: vscode.TextEditor | undefined): Promise<vscode.Range | undefined> {
        if (editor?.document === undefined) {
            return undefined
        }

        const doc = editor.document

        const resp = await this.client?.sendRequest('$/alive/topFormBounds', {
            textDocument: {
                uri: doc.uri.toString(),
            },
            position: editor.selection.active,
        })

        if (typeof resp !== 'object' || resp === null) {
            return
        }

        const respObj = resp as { [index: string]: unknown }
        const startPos = parsePos(respObj.start)
        const endPos = parsePos(respObj.end)

        if (startPos === undefined || endPos === undefined) {
            return
        }

        return new vscode.Range(startPos, endPos)
    }

    async selectSexpr(editor: vscode.TextEditor | undefined) {
        if (editor?.document === undefined) {
            return
        }

        const range = await this.getTopExprRange(editor)

        if (range === undefined) {
            return
        }

        editor.selection = new vscode.Selection(range?.start, range?.end)
    }
}
