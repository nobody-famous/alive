import { EventEmitter } from 'events'
import * as net from 'net'
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node'
import { isRestartInfo, isStackTrace } from '../Guards'
import {
    CompileFileNote,
    CompileFileResp,
    CompileLocation,
    DebugInfo,
    EvalInfo,
    ExtensionState,
    HostPort,
    InspectInfo,
    InspectResult,
    isInspectResult,
    LispSymbol,
    MacroInfo,
    Package,
    Thread,
} from '../Types'
import { COMMON_LISP_ID, hasValidLangId, parseToInt, strToMarkdown } from '../Utils'
import { log, toLog } from '../Log'

type RangeFunction = (editor: vscode.TextEditor) => Promise<vscode.Range | undefined>

export declare interface LSP {
    on(event: 'refreshPackages', listener: () => void): this
    on(event: 'refreshThreads', listener: () => void): this
    on(event: 'refreshInspectors', listener: () => void): this
    on(event: 'refreshDiagnostics', listener: () => void): this
    on(event: 'startCompileTimer', listener: () => void): this
    on(event: 'output', listener: (str: string) => void): this
    on(event: 'getRestartIndex', listener: (info: DebugInfo, fn: (index: number | undefined) => void) => void): this
    on(event: 'getUserInput', listener: (fn: (input: string) => void) => void): this
    on(event: 'inspectResult', listener: (result: InspectInfo) => void): this
    on(event: 'inspectUpdate', listener: (result: InspectResult) => void): this
}

export class LSP extends EventEmitter {
    private state: ExtensionState
    private client: LanguageClient | undefined

    constructor(state: ExtensionState) {
        super()

        this.state = state
    }

    connect = async (hostPort: HostPort): Promise<void> => {
        const serverOpts: () => Promise<StreamInfo> = () => {
            return new Promise((resolve, reject) => {
                const socket: net.Socket = net.connect({ port: hostPort.port, host: hostPort.host }, () =>
                    resolve({ reader: socket, writer: socket })
                )

                socket.on('error', (err: unknown) => reject(err))
            })
        }
        const clientOpts: LanguageClientOptions = {
            markdown: {
                isTrusted: true,
            },
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

        this.client.onNotification('$/alive/refresh', (params: unknown) => {
            this.emitRefresh()
        })

        this.client.onRequest('$/alive/debugger', async (params: unknown) => {
            const info = this.parseDebugInfo(params)
            if (info === undefined) {
                return
            }

            const requestIndex = () => {
                return new Promise<number | undefined>((resolve, reject) => {
                    this.emit('getRestartIndex', info, (index: number | undefined) => resolve(index))
                })
            }

            const index = await requestIndex()

            return { index }
        })

        this.client.onRequest('$/alive/userInput', async () => {
            const requestInput = () => {
                return new Promise<string>((resolve, reject) => {
                    this.emit('getUserInput', (input: string) => resolve(input))
                })
            }

            const input = await requestInput()

            return { text: input }
        })
    }

    private parseDebugInfo = (params: unknown): DebugInfo | undefined => {
        if (typeof params !== 'object' || params === null) {
            return
        }

        const paramsObj = params as { [index: string]: unknown }

        if (typeof paramsObj.message !== 'string' || !Array.isArray(paramsObj.restarts) || !Array.isArray(paramsObj.stackTrace)) {
            return
        }

        const isRestarts = paramsObj.restarts.reduce((acc, item) => acc && isRestartInfo(item))
        const isStack = isStackTrace(paramsObj.stackTrace)

        return {
            message: paramsObj.message,
            restarts: isRestarts ? paramsObj.restarts : [],
            stackTrace: isStack ? paramsObj.stackTrace : [],
        }
    }

    private sendOutput = (params: unknown) => {
        if (typeof params !== 'object' || params === null) {
            throw new Error('Invalid output message')
        }

        const paramsObj = params as { [index: string]: unknown }

        if (typeof paramsObj.data !== 'string') {
            throw new Error('Invalid output message')
        }

        this.emit('output', paramsObj.data)
    }

    inspectClosed = async (info: InspectInfo) => {
        await this.client?.sendRequest('$/alive/inspectClose', { id: info.id })
    }

    private handleError = (err: unknown) => {
        const errObj = err as { message: string }

        if (errObj.message !== undefined) {
            this.emit('output', errObj.message)
        } else {
            this.emit('output', JSON.stringify(err))
        }
    }

    inspectEval = async (info: InspectInfo, text: string) => {
        try {
            const resp = await this.client?.sendRequest('$/alive/inspectEval', { id: info.id, text })

            if (isInspectResult(resp) && resp.id !== info.id) {
                const newInfo: InspectInfo = {
                    id: resp.id,
                    resultType: resp.resultType,
                    result: resp.result,
                    text,
                    package: info.package,
                }

                this.emit('inspectResult', newInfo)
            }

            await this.inspectRefresh(info)
        } catch (err) {
            this.handleError(err)
        }
    }

    inspectRefresh = async (info: InspectInfo) => {
        try {
            if (info.resultType === 'macro') {
                this.inspectRefreshMacro(info)
                return
            }

            const resp = await this.client?.sendRequest('$/alive/inspectRefresh', { id: info.id })

            if (isInspectResult(resp)) {
                this.emit('inspectUpdate', resp)
            }
        } catch (err) {
            this.handleError(err)
        }
    }

    inspectRefreshMacro = async (info: InspectInfo) => {
        try {
            const resp = await this.doMacroExpand('$/alive/macroexpand1', info.text, info.package)

            if (typeof resp === 'string') {
                const newInfo = Object.assign({}, info)

                newInfo.result = resp

                this.emit('inspectUpdate', newInfo)
            }
        } catch (err) {
            this.handleError(err)
        }
    }

    inspectMacroInc = async (info: InspectInfo) => {
        try {
            const oldResult = typeof info.result === 'string' ? info.result : info.text
            const resp = await this.doMacroExpand('$/alive/macroexpand1', oldResult, info.package)

            if (typeof resp === 'string') {
                const newInfo = Object.assign({}, info)

                newInfo.result = resp

                this.emit('inspectUpdate', newInfo)
            }
        } catch (err) {
            this.handleError(err)
        }
    }

    private emitRefresh() {
        this.emit('refreshThreads')
        this.emit('refreshInspectors')
        this.emit('refreshDiagnostics')
    }

    inspectSymbol = async (symbol: LispSymbol): Promise<void> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/inspectSymbol', { symbol: symbol.name, package: symbol.package })

            if (isInspectResult(resp)) {
                const info: InspectInfo = {
                    id: resp.id,
                    resultType: resp.resultType,
                    result: resp.result,
                    text: symbol.name,
                    package: symbol.package,
                }

                this.emit('inspectResult', info)
            }
        } catch (err) {
            this.handleError(err)
        }
    }

    inspectMacro = async (text: string, pkgName: string): Promise<void> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/inspectMacro', { text, package: pkgName })

            if (isInspectResult(resp)) {
                const info: InspectInfo = {
                    id: resp.id,
                    resultType: resp.resultType,
                    result: resp.result,
                    text: text,
                    package: pkgName,
                }

                this.emit('inspectResult', info)
            }
        } catch (err) {
            this.handleError(err)
        }
    }

    inspect = async (text: string, pkgName: string): Promise<void> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/inspect', { text, package: pkgName })

            if (isInspectResult(resp)) {
                const info: InspectInfo = {
                    id: resp.id,
                    resultType: resp.resultType,
                    result: resp.result,
                    text: text,
                    package: pkgName,
                }

                this.emit('inspectResult', info)
            }
        } catch (err) {
            this.handleError(err)
        }
    }

    doEval = async (text: string, pkgName: string, storeResult?: boolean): Promise<string | undefined> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/eval', { text, package: pkgName, storeResult })

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
        }
    }

    eval = async (text: string, pkgName: string, storeResult?: boolean): Promise<void> => {
        const result = await this.doEval(text, pkgName, storeResult)

        if (result !== undefined) {
            this.emit('output', result)
        }
    }

    listAsdfSystems = async (): Promise<string[]> => {
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

    listPackages = async (): Promise<Package[]> => {
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

    killThread = async (thread: Thread): Promise<void> => {
        await this.client?.sendRequest('$/alive/killThread', { id: thread.id })
    }

    listThreads = async (): Promise<Thread[]> => {
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

    loadAsdfSystem = async (name: string): Promise<CompileFileResp | undefined> => {
        return await this.client?.sendRequest('$/alive/loadAsdfSystem', { name })
    }

    loadFile = async (path: string, showMsgs?: boolean): Promise<void> => {
        try {
            const promise = this.client?.sendRequest('$/alive/loadFile', { path, showStdout: true, showStderr: true })

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
        }
    }

    textDocumentChanged = (event: vscode.TextDocumentChangeEvent): void => {
        if (!hasValidLangId(event.document, [COMMON_LISP_ID])) {
            return
        }

        this.state.hoverText = ''

        this.emit('startCompileTimer')
    }

    editorChanged = (editor?: vscode.TextEditor): void => {
        if (editor === undefined || !hasValidLangId(editor.document, [COMMON_LISP_ID])) {
            return
        }

        this.emit('startCompileTimer')
    }

    compileFile = async (path: string): Promise<void> => {
        await this.client?.sendRequest('$/alive/compile', { path })
    }

    tryCompileFile = async (path: string): Promise<CompileFileResp | undefined> => {
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

    isConnected = (): boolean => {
        return this.client !== undefined
    }

    getTextAndPackage = async (editor: vscode.TextEditor | undefined, rangeFn: RangeFunction): Promise<EvalInfo | undefined> => {
        if (editor === undefined) {
            return
        }

        const range = editor.selection.isEmpty
            ? await rangeFn(editor)
            : new vscode.Range(editor.selection.start, editor.selection.end)

        if (range === undefined) {
            return
        }

        const text = editor.document.getText(range)
        const pkg = await this.getPackage(editor, range.start)

        return text !== undefined && pkg !== undefined ? { text, package: pkg } : undefined
    }

    getEvalInfo = async (editor: vscode.TextEditor | undefined): Promise<EvalInfo | undefined> => {
        return await this.getTextAndPackage(editor, this.getTopExprRange)
    }

    private doMacroExpand = async (method: string, text: string, pkgName: string) => {
        try {
            const resp = await this.client?.sendRequest(method, { text, package: pkgName })

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
        }
    }

    macroexpand = async (text: string, pkgName: string): Promise<string | undefined> => {
        return await this.doMacroExpand('$/alive/macroexpand', text, pkgName)
    }

    macroexpand1 = async (text: string, pkgName: string): Promise<string | undefined> => {
        return await this.doMacroExpand('$/alive/macroexpand1', text, pkgName)
    }

    getMacroInfo = async (editor: vscode.TextEditor | undefined): Promise<MacroInfo | undefined> => {
        if (editor === undefined) {
            return
        }

        const range = editor.selection.isEmpty
            ? await this.getSurroundingExprRange(editor)
            : new vscode.Range(editor.selection.start, editor.selection.end)

        if (range === undefined) {
            return
        }

        const text = editor.document.getText(range)
        const pkg = await this.getPackage(editor, range.start)

        return text !== undefined && pkg !== undefined ? { range, text, package: pkg } : undefined
    }

    getPackage = async (editor: vscode.TextEditor, pos: vscode.Position): Promise<string | undefined> => {
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

    removePackage = async (name: string): Promise<void> => {
        await this.client?.sendRequest('$/alive/removePackage', {
            name,
        })

        this.emit('refreshPackages')
    }

    removeExport = async (pkg: string, name: string): Promise<void> => {
        await this.client?.sendRequest('$/alive/unexportSymbol', {
            package: pkg,
            symbol: name,
        })

        this.emit('refreshPackages')
    }

    getExprRange = async (editor: vscode.TextEditor | undefined, method: string): Promise<vscode.Range | undefined> => {
        if (editor?.document === undefined) {
            return
        }

        const doc = editor.document

        const resp = await this.client?.sendRequest(method, {
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

    getSurroundingExprRange = async (editor: vscode.TextEditor | undefined): Promise<vscode.Range | undefined> => {
        return await this.getExprRange(editor, '$/alive/surroundingFormBounds')
    }

    getTopExprRange = async (editor: vscode.TextEditor | undefined): Promise<vscode.Range | undefined> => {
        return await this.getExprRange(editor, '$/alive/topFormBounds')
    }

    getSymbol = async (fileUri: vscode.Uri, pos: vscode.Position): Promise<LispSymbol | undefined> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/symbol', {
                textDocument: {
                    uri: fileUri.toString(),
                },
                position: pos,
            })

            if (typeof resp !== 'object') {
                return
            }

            const respObj = resp as { [index: string]: unknown }

            if (!Array.isArray(respObj.value)) {
                return
            }

            const [name, pkgName] = respObj.value

            return { name, package: pkgName }
        } catch (err) {
            log(`Failed to get symbol: ${err}`)
        }
    }

    getHoverText = async (fileUri: vscode.Uri, pos: vscode.Position): Promise<string> => {
        try {
            const resp = await this.client?.sendRequest('textDocument/hover', {
                textDocument: {
                    uri: fileUri.toString(),
                },
                position: pos,
            })

            if (typeof resp !== 'object' || resp === null) {
                return ''
            }

            const respObj = resp as { [index: string]: unknown }

            if (typeof respObj.value !== 'string') {
                return ''
            }

            return strToMarkdown(respObj.value)
        } catch (err) {
            log(`Hover failed: ${err}`)
        }

        return ''
    }
}

const parsePos = (data: unknown): vscode.Position | undefined => {
    if (typeof data !== 'object' || data === null) {
        return
    }

    const dataObj = data as { [index: string]: unknown }
    const line = parseToInt(dataObj.line)
    const col = parseToInt(dataObj.character)

    if (line === undefined || col === undefined) {
        return
    }

    return new vscode.Position(line, col)
}
