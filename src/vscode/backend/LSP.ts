import * as vscode from 'vscode'
import * as net from 'net'
import { Backend, CompileFileResp, HostPort } from '../Types'
import { COMMON_LISP_ID } from '../Utils'
import { LanguageClient, LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node'

export class LSP implements Backend {
    public defaultPort: number = 25483
    private client: LanguageClient | undefined

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
        console.log(`loadFile ${path}`)
        const resp = await this.client?.sendRequest('$/alive/loadFile', {})
        console.log(resp)
    }

    async compileFile(path: string, ignoreOutput?: boolean): Promise<CompileFileResp | undefined> {
        return
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
