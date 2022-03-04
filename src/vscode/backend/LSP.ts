import * as vscode from 'vscode'
import * as net from 'net'
import { Backend, CompileFileNote, CompileFileResp, CompileLocation, HostPort, LSPBackendState } from '../Types'
import { COMMON_LISP_ID, hasValidLangId, startCompileTimer } from '../Utils'
import { LanguageClient, LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node'

const lspOutputChannel = vscode.window.createOutputChannel('Alive Output')

export class LSP implements Backend {
    private state: LSPBackendState
    public defaultPort: number = 25483
    private client: LanguageClient | undefined

    constructor(state: LSPBackendState) {
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
            lspOutputChannel.appendLine(params.data)
            lspOutputChannel.show()
        })
        this.client.onNotification('$/alive/stdout', (params) => {
            lspOutputChannel.appendLine(params.data)
            lspOutputChannel.show()
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

        const parseToInt = (data: unknown): number | undefined => {
            if (typeof data !== 'string' && typeof data !== 'number') {
                return
            }

            const int = typeof data === 'string' ? parseInt(data) : data

            return Number.isFinite(int) ? int : undefined
        }

        const parseLocation = (data: unknown): CompileLocation | undefined => {
            if (!Array.isArray(data) || data.length !== 2) {
                return
            }

            const start = parseToInt(data[0])
            const end = parseToInt(data[1])

            if (start === undefined || end === undefined) {
                return
            }

            return {
                file: path,
                startPosition: start,
                endPosition: end,
            }
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
}
