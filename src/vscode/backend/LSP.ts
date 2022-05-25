import * as vscode from 'vscode'
import * as net from 'net'
import {
    Backend,
    CompileFileNote,
    CompileFileResp,
    CompileLocation,
    DebugInfo,
    ExtensionState,
    HostPort,
    Package,
    Thread,
} from '../Types'
import { COMMON_LISP_ID, hasValidLangId, startCompileTimer, strToMarkdown } from '../Utils'
import { LanguageClient, LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node'
import { EventEmitter } from 'events'
import { refreshPackages, refreshThreads } from '../commands'
import { DebugView } from '../repl'

interface EvalInfo {
    text: string
    package: string
}

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
    private state: ExtensionState
    private client: LanguageClient | undefined

    constructor(state: ExtensionState) {
        super()

        this.state = state
    }

    async connect(hostPort: HostPort): Promise<void> {
        const serverOpts: () => Promise<StreamInfo> = () => {
            return new Promise((resolve, reject) => {
                const socket: net.Socket = net.connect({ port: hostPort.port, host: hostPort.host }, () =>
                    resolve({ reader: socket, writer: socket })
                )

                socket.on('error', (err: unknown) => reject(err))
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

        this.client.onNotification('$/alive/stderr', (params: unknown) => {
            this.sendOutput(params)
        })

        this.client.onNotification('$/alive/stdout', (params: unknown) => {
            this.sendOutput(params)
        })

        this.client.onRequest('$/alive/debugger', async (params: unknown) => {
            const index = await this.getRestartIndex(params)

            return { index }
        })

        this.client.onRequest('$/alive/userInput', async () => {
            const input = await vscode.window.showInputBox()
            const text = input !== undefined ? `${input}\n` : '\n'

            return { text }
        })
    }

    private showDebugWindow(info: DebugInfo) {
        return new Promise<number>((resolve, reject) => {
            if (this.state.ctx === undefined) {
                return reject('Debugger: No extension context')
            }

            const view = new DebugView(this.state.ctx, 'Debug', vscode.ViewColumn.Two, info)

            view.on('restart', (num: number) => {
                view.stop()
                resolve(num)
            })

            view.run()
        })
    }

    private parseDebugInfo(params: unknown): DebugInfo | undefined {
        if (this.state.ctx === undefined) {
            throw new Error('Debugger: No extension context')
        }

        if (typeof params !== 'object' || params === null) {
            return
        }

        const paramsObj = params as { [index: string]: unknown }

        if (typeof paramsObj.message !== 'string' || !Array.isArray(paramsObj.restarts) || !Array.isArray(paramsObj.stackTrace)) {
            return
        }

        for (const item of paramsObj.restarts) {
            if (typeof item !== 'string') {
                return
            }
        }

        for (const item of paramsObj.stackTrace) {
            if (typeof item !== 'string') {
                return
            }
        }

        return {
            message: paramsObj.message,
            restarts: paramsObj.restarts,
            stackTrace: paramsObj.stackTrace,
        }
    }

    private async getRestartIndex(params: unknown) {
        const info = this.parseDebugInfo(params)

        if (info === undefined) {
            throw new Error('Invalid debugger info')
        }

        return await this.showDebugWindow(info)
    }

    private sendOutput(params: unknown) {
        if (typeof params !== 'object' || params === null) {
            throw new Error('Invalid output message')
        }

        const paramsObj = params as { [index: string]: unknown }

        if (typeof paramsObj.data !== 'string') {
            throw new Error('Invalid output message')
        }

        this.emit('output', paramsObj.data)
    }

    private async doEval(text: string, pkgName: string, storeResult?: boolean): Promise<string | undefined> {
        try {
            const promise = this.client?.sendRequest('$/alive/eval', { text, package: pkgName, storeResult })

            refreshThreads(this.state)

            const resp = await promise

            if (typeof resp !== 'object') {
                return
            }

            const resultObj = resp as { text: string }

            if (resultObj.text !== undefined) {
                return resultObj.text
            }
        } catch (err) {
            const errObj = err as { message: string }

            if (errObj.message !== undefined) {
                this.emit('output', errObj.message)
            } else {
                this.emit('output', JSON.stringify(err))
            }
        } finally {
            refreshThreads(this.state)
        }

        return
    }

    async inlineEval(editor: vscode.TextEditor | undefined): Promise<void> {
        const info = await this.getEvalInfo(editor)

        if (editor === undefined || info === undefined) {
            return
        }

        const result = await this.doEval(info.text, info.package)

        if (result !== undefined) {
            this.state.hoverText = `=> ${strToMarkdown(result)}`
            await vscode.window.showTextDocument(editor.document, editor.viewColumn)
            vscode.commands.executeCommand('editor.action.showHover')
        }
    }

    async eval(text: string, pkgName: string, storeResult?: boolean): Promise<void> {
        const result = await this.doEval(text, pkgName, storeResult)

        if (result !== undefined) {
            this.emit('output', result)
        }
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
        await refreshThreads(this.state)
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

    async loadAsdfSystem(name: string): Promise<CompileFileResp | undefined> {
        return await this.client?.sendRequest('$/alive/loadAsdfSystem', { name })
    }

    async loadFile(path: string, showMsgs?: boolean): Promise<void> {
        try {
            const promise = this.client?.sendRequest('$/alive/loadFile', { path, showStdout: true, showStderr: true })

            refreshThreads(this.state)

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
            refreshThreads(this.state)
        }
    }

    textDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
        if (!hasValidLangId(event.document, [COMMON_LISP_ID])) {
            return
        }

        this.state.hoverText = ''

        startCompileTimer(this.state)
    }

    editorChanged(editor?: vscode.TextEditor): void {
        if (editor === undefined || !hasValidLangId(editor.document, [COMMON_LISP_ID])) {
            return
        }

        startCompileTimer(this.state)
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

    isConnected(): boolean {
        return this.client !== undefined
    }

    private async getEvalInfo(editor: vscode.TextEditor | undefined): Promise<EvalInfo | undefined> {
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

        return text !== undefined && pkg !== undefined ? { text, package: pkg } : undefined
    }

    async sendToRepl(editor: vscode.TextEditor | undefined) {
        const info = await this.getEvalInfo(editor)

        if (info !== undefined) {
            await vscode.workspace.saveAll()
            await this.eval(info.text, info.package)
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

        await refreshPackages(this.state)
    }

    async removeExport(pkg: string, name: string): Promise<void> {
        await this.client?.sendRequest('$/alive/unexportSymbol', {
            package: pkg,
            symbol: name,
        })

        await refreshPackages(this.state)
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
