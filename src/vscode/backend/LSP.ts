import * as vscode from 'vscode'
import * as net from 'net'
import { Backend, CompileFileNote, CompileFileResp, CompileLocation, HostPort, LSPBackendState } from '../Types'
import { COMMON_LISP_ID, hasValidLangId, startCompileTimer } from '../Utils'
import { LanguageClient, LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node'
import EventEmitter = require('events')

const lspOutputChannel = vscode.window.createOutputChannel('Alive Output')

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
            // lspOutputChannel.appendLine(params.data)
            // lspOutputChannel.show()
            this.emit('output', params.data)
        })
        this.client.onNotification('$/alive/stdout', (params) => {
            // lspOutputChannel.appendLine(params.data)
            // lspOutputChannel.show()
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

    async eval(text: string, pkgName: string): Promise<string | undefined> {
        try {
            const resp = await this.client?.sendRequest('$/alive/eval', { text, package: pkgName })

            this.emit('output', JSON.stringify(resp))
        } catch (err) {
            const errObj = err as { message: string }

            if (errObj.message !== undefined) {
                this.emit('output', errObj.message)
            } else {
                this.emit('output', JSON.stringify(err))
            }
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
        return []
    }

    async compileAsdfSystem(name: string): Promise<CompileFileResp | undefined> {
        return
    }

    async loadAsdfSystem(name: string): Promise<CompileFileResp | undefined> {
        return
    }

    async loadFile(path: string, showMsgs?: boolean): Promise<void> {
        const resp = await this.client?.sendRequest('$/alive/loadFile', { path, showStdout: true, showStderr: true })

        if (typeof resp !== 'object') {
            return
        }

        const respObj = resp as { [index: string]: unknown }

        if (!Array.isArray(respObj.messages)) {
            return
        }

        let needShow = false
        for (const msg of respObj.messages) {
            if (typeof msg !== 'object') {
                continue
            }

            const msgObj = msg as { [index: string]: unknown }

            if (typeof msgObj.severity !== 'string' || typeof msgObj.message !== 'string') {
                continue
            }

            needShow = true
            lspOutputChannel.appendLine(`${msgObj.severity.toUpperCase()}: ${msgObj.message}`)
        }

        if (needShow) {
            lspOutputChannel.show()
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

    async compileFile(path: string, ignoreOutput?: boolean): Promise<CompileFileResp | undefined> {
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

    async sendToRepl(editor: vscode.TextEditor, text: string, pkgName: string, captureOutput: boolean): Promise<void> {}

    async replNthRestart(restart: number): Promise<void> {}

    async installServer(): Promise<void> {}

    serverInstallPath(): string | undefined {
        return
    }

    serverStartupCommand(): string[] | undefined {
        return
    }

    async selectSexpr(editor: vscode.TextEditor | undefined) {
        if (editor?.document === undefined) {
            return
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

        editor.selection = new vscode.Selection(startPos, endPos)
    }
}
