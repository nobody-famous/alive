import { EventEmitter } from 'events'
import * as net from 'net'
import { EOL } from 'os'
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, StreamInfo } from 'vscode-languageclient/node'
import { isArray, isInspectResult, isObject, isPackage, isRestartInfo, isStackTrace, isString, isThread } from '../Guards'
import { log, toLog } from '../Log'
import {
    CompileFileNote,
    CompileFileResp,
    DebugInfo,
    EvalInfo,
    ExtensionState,
    HostPort,
    InspectInfo,
    InspectResult,
    LispSymbol,
    MacroInfo,
    Package,
    Thread,
} from '../Types'
import { COMMON_LISP_ID, diagnosticsEnabled, hasValidLangId, parseNote, parsePos, strToMarkdown } from '../Utils'

export declare interface LSPEvents {
    on(event: 'refreshPackages', listener: () => void): this
    on(event: 'refreshAsdfSystems', listener: () => void): this
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

export class LSP extends EventEmitter implements LSPEvents {
    private state: Pick<ExtensionState, 'hoverText'>
    private client: LanguageClient | undefined

    constructor(state: Pick<ExtensionState, 'hoverText'>) {
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

        this.client.onNotification('$/alive/refresh', () => {
            this.emitRefresh()
        })

        this.client.onRequest('$/alive/debugger', async (params: unknown) => {
            const info = this.parseDebugInfo(params)
            if (info === undefined) {
                return
            }

            const requestIndex = () => {
                return new Promise<number | undefined>((resolve) => {
                    this.emit('getRestartIndex', info, (index: number | undefined) => resolve(index))
                })
            }

            const index = await requestIndex()

            return { index }
        })

        this.client.onRequest('$/alive/userInput', async () => {
            const requestInput = () => {
                return new Promise<string>((resolve) => {
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
        this.emit('refreshPackages')
        this.emit('refreshAsdfSystems')
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
        this.emit('output', `${EOL}${text}`)

        const result = await this.doEval(text, pkgName, storeResult)

        if (result !== undefined) {
            this.emit('output', result)
        }
    }

    listAsdfSystems = async (): Promise<string[]> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/listAsdfSystems')

            if (!isObject(resp) || !Array.isArray(resp.systems)) {
                return []
            }

            const systems: string[] = []

            for (const sys of resp.systems) {
                if (typeof sys === 'string') {
                    systems.push(sys)
                }
            }

            return systems
        } catch (err) {
            log(`Failed to list ASDF systems: ${toLog(err)}`)
            return []
        }
    }

    listPackages = async (): Promise<Package[]> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/listPackages')

            if (!isObject(resp) || !Array.isArray(resp.packages)) {
                return []
            }

            const pkgs: Package[] = []

            for (const item of resp.packages) {
                if (!isPackage(item)) {
                    continue
                }

                pkgs.push(item)
            }

            return pkgs
        } catch (err) {
            log(`Failed to list packages: ${toLog(err)}`)
            return []
        }
    }

    killThread = async (thread: Thread): Promise<void> => {
        try {
            await this.client?.sendRequest('$/alive/killThread', { id: thread.id })
        } catch (err) {
            log(`Failed to kill thread: ${toLog(err)}`)
        }
    }

    listThreads = async (): Promise<Thread[]> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/listThreads')

            if (!isObject(resp) || !Array.isArray(resp.threads)) {
                return []
            }

            const threads: Thread[] = []

            for (const item of resp.threads) {
                if (!isThread(item)) {
                    continue
                }

                threads.push(item)
            }

            return threads
        } catch (err) {
            log(`Failed to list threads: ${toLog(err)}`)
            return []
        }
    }

    loadAsdfSystem = async (name: string): Promise<CompileFileResp | undefined> => {
        try {
            return await this.client?.sendRequest('$/alive/loadAsdfSystem', { name })
        } catch (err) {
            log(`Failed to load ASDF system: ${toLog(err)}`)
        }
    }

    loadFile = async (path: string): Promise<void> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/loadFile', { path, showStdout: true, showStderr: true })

            if (!isObject(resp) || !Array.isArray(resp.messages)) {
                return
            }

            for (const msg of resp.messages) {
                if (!isObject(msg) || !isString(msg.severity) || !isString(msg.message)) {
                    continue
                }

                this.emit('output', `${msg.severity.toUpperCase()}: ${msg.message}`)
            }
        } catch (err) {
            this.emit('output', isObject(err) && isString(err.message) ? err.message : JSON.stringify(err))
        }
    }

    textDocumentChanged = (doc: Pick<vscode.TextDocument, 'languageId'>): void => {
        if (!hasValidLangId(doc, [COMMON_LISP_ID])) {
            return
        }

        this.state.hoverText = ''

        if (diagnosticsEnabled()) {
            this.emit('startCompileTimer')
        }
    }

    editorChanged = (doc: Pick<vscode.TextDocument, 'languageId'>): void => {
        if (hasValidLangId(doc, [COMMON_LISP_ID]) && diagnosticsEnabled()) {
            this.emit('startCompileTimer')
        }
    }

    private doCompile = async (method: string, path: string): Promise<CompileFileResp> => {
        try {
            const resp = await this.client?.sendRequest(method, { path })

            if (!isObject(resp) || !Array.isArray(resp.messages)) {
                return { notes: [] }
            }

            const notes: CompileFileNote[] = []
            const seen: { [index: string]: true } = {}

            for (const item of resp.messages) {
                const note = parseNote(path, item)

                if (note !== undefined && seen[note.message] === undefined) {
                    seen[note.message] = true
                    notes.push(note)
                }
            }

            return { notes }
        } catch (err) {
            log(`Failed to compile file: ${toLog(err)}`)
            return { notes: [] }
        }
    }

    compileFile = async (path: string): Promise<CompileFileResp> => {
        return await this.doCompile('$/alive/compile', path)
    }

    tryCompileFile = async (path: string): Promise<CompileFileResp> => {
        return await this.doCompile('$/alive/tryCompile', path)
    }

    isConnected = (): boolean => {
        return this.client !== undefined
    }

    getEvalInfo = async (
        getTextFn: (range: vscode.Range) => string,
        uri: string,
        selection: Pick<vscode.Selection, 'active' | 'isEmpty' | 'start' | 'end'>
    ): Promise<EvalInfo | undefined> => {
        const range = selection.isEmpty
            ? await this.getTopExprRange(uri, selection)
            : new vscode.Range(selection.start, selection.end)

        if (range === undefined) {
            return
        }

        const text = getTextFn(range)
        const pkg = await this.getPackage(uri, range.start)

        return text !== undefined && pkg !== undefined ? { text, package: pkg } : undefined
    }

    private doMacroExpand = async (method: string, text: string, pkgName: string) => {
        try {
            const resp = await this.client?.sendRequest(method, { text, package: pkgName })

            if (!isObject(resp) || !isString(resp.text)) {
                return
            }

            return resp.text
        } catch (err) {
            const msg = isObject(err) && isString(err.message) ? err.message : JSON.stringify(err)
            this.emit('output', msg)
        }
    }

    macroexpand = async (text: string, pkgName: string): Promise<string | undefined> => {
        return await this.doMacroExpand('$/alive/macroexpand', text, pkgName)
    }

    macroexpand1 = async (text: string, pkgName: string): Promise<string | undefined> => {
        return await this.doMacroExpand('$/alive/macroexpand1', text, pkgName)
    }

    getMacroInfo = async (
        getTextFn: (range?: vscode.Range) => string,
        uri: string,
        selection: Pick<vscode.Selection, 'active' | 'isEmpty' | 'start' | 'end'>
    ): Promise<MacroInfo | undefined> => {
        const range = selection.isEmpty
            ? await this.getSurroundingExprRange(uri, selection)
            : new vscode.Range(selection.start, selection.end)

        if (range === undefined) {
            return
        }

        const text = getTextFn(range)
        const pkg = await this.getPackage(uri, range.start)

        return text !== undefined && pkg !== undefined ? { range, text, package: pkg } : undefined
    }

    getPackage = async (uri: string, pos: vscode.Position): Promise<string | undefined> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/getPackageForPosition', {
                textDocument: { uri },
                position: pos,
            })

            if (!isObject(resp) || !isString(resp.package)) {
                return
            }

            return resp.package
        } catch (err) {
            log(`Failed to get package: ${toLog(err)}`)
        }
    }

    removePackage = async (name: string): Promise<void> => {
        try {
            if (this.client === undefined) {
                return
            }

            await this.client?.sendRequest('$/alive/removePackage', {
                name,
            })

            this.emit('refreshPackages')
        } catch (err) {
            log(`Failed to remove package: ${toLog(err)}`)
        }
    }

    removeExport = async (pkg: string, name: string): Promise<void> => {
        try {
            if (this.client === undefined) {
                return
            }

            await this.client.sendRequest('$/alive/unexportSymbol', {
                package: pkg,
                symbol: name,
            })

            this.emit('refreshPackages')
        } catch (err) {
            log(`Failed to remove export: ${toLog(err)}`)
        }
    }

    getExprRange = async (
        method: string,
        uri: string,
        selection: Pick<vscode.Selection, 'active'>
    ): Promise<vscode.Range | undefined> => {
        try {
            const resp = await this.client?.sendRequest(method, {
                textDocument: { uri },
                position: selection.active,
            })

            if (!isObject(resp)) {
                return
            }

            const startPos = parsePos(resp.start)
            const endPos = parsePos(resp.end)

            if (startPos === undefined || endPos === undefined) {
                return
            }

            return new vscode.Range(startPos, endPos)
        } catch (err) {
            log(`Failed to get expression range: ${toLog(err)}`)
        }
    }

    getSurroundingExprRange = async (
        uri: string,
        selection: Pick<vscode.Selection, 'active'>
    ): Promise<vscode.Range | undefined> => {
        return await this.getExprRange('$/alive/surroundingFormBounds', uri, selection)
    }

    getTopExprRange = async (uri: string, selection: Pick<vscode.Selection, 'active'>): Promise<vscode.Range | undefined> => {
        return await this.getExprRange('$/alive/topFormBounds', uri, selection)
    }

    getSymbol = async (fileUri: string, pos: vscode.Position): Promise<LispSymbol | undefined> => {
        try {
            const resp = await this.client?.sendRequest('$/alive/symbol', {
                textDocument: {
                    uri: fileUri,
                },
                position: pos,
            })

            if (!isObject(resp) || !isArray(resp.value, isString) || resp.value.length !== 2) {
                return
            }

            const [name, pkgName] = resp.value

            return { name, package: pkgName }
        } catch (err) {
            log(`Failed to get symbol: ${toLog(err)}`)
        }
    }

    getHoverText = async (fileUri: string, pos: vscode.Position): Promise<string> => {
        try {
            const resp = await this.client?.sendRequest('textDocument/hover', {
                textDocument: {
                    uri: fileUri,
                },
                position: pos,
            })

            if (!isObject(resp) || !isString(resp.value)) {
                return ''
            }

            return strToMarkdown(resp.value)
        } catch (err) {
            log(`Hover failed: ${toLog(err)}`)
            return ''
        }
    }
}
