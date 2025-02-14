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

interface LSPEvents {
    refreshPackages: []
    refreshAsdfSystems: []
    refreshThreads: []
    refreshInspectors: []
    refreshDiagnostics: []
    startCompileTimer: []
    input: [str: string, pkgName: string]
    output: [str: string]
    queryText: [str: string]
    getRestartIndex: [info: DebugInfo, fn: (index: number | undefined) => void]
    getUserInput: [fn: (input: string) => void]
    inspectResult: [result: InspectInfo]
    inspectUpdate: [result: InspectResult]
}

export class LSP extends EventEmitter<LSPEvents> {
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

        this.client.onNotification('$/alive/query-io', (params: unknown) => {
            this.sendQueryText(params)
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

    private emitRefresh() {
        this.emit('refreshPackages')
        this.emit('refreshAsdfSystems')
        this.emit('refreshThreads')
        this.emit('refreshInspectors')
        this.emit('refreshDiagnostics')
    }

    private parseDebugInfo = (params: unknown): DebugInfo | undefined => {
        if (
            !isObject(params) ||
            !isString(params.message) ||
            !Array.isArray(params.restarts) ||
            !Array.isArray(params.stackTrace)
        ) {
            return
        }

        const hasRestarts = params.restarts.every(isRestartInfo)
        const hasStack = isStackTrace(params.stackTrace)

        return {
            message: params.message,
            restarts: hasRestarts ? params.restarts : [],
            stackTrace: hasStack ? params.stackTrace : [],
        }
    }

    private sendOutput = (params: unknown) => {
        if (!isObject(params) || !isString(params.data)) {
            return
        }

        this.emit('output', params.data)
    }

    private sendQueryText = (params: unknown) => {
        if (!isObject(params) || !isString(params.data)) {
            return
        }

        this.emit('queryText', params.data)
    }

    inspectClosed = async (info: InspectInfo) => {
        try {
            await this.client?.sendRequest('$/alive/inspectClose', { id: info.id })
        } catch (err) {
            this.handleError(err)
        }
    }

    private handleError = (err: unknown) => {
        this.emit('output', isObject(err) && isString(err.message) ? err.message : JSON.stringify(err))
    }

    inspectEval = async (info: InspectInfo, text: string) => {
        try {
            if (this.client === undefined) {
                return
            }

            const resp = await this.client.sendRequest('$/alive/inspectEval', { id: info.id, text })

            if (isInspectResult(resp) && resp.id !== info.id) {
                const newInfo: InspectInfo = {
                    id: resp.id,
                    resultType: resp.resultType,
                    result: resp.result,
                    text,
                    package: info.package,
                }

                this.emit('inspectResult', newInfo)
                return
            }

            await this.inspectRefresh(info)
        } catch (err) {
            this.handleError(err)
        }
    }

    private doInspectMacro = async (text: string, info: Pick<InspectInfo, 'package' | 'result'>) => {
        return await this.doMacroExpand('$/alive/macroexpand1', text, info.package)
    }

    inspectRefresh = async (info: InspectInfo) => {
        try {
            const resp =
                info.resultType === 'macro'
                    ? await this.inspectRefreshMacro(info)
                    : await this.client?.sendRequest('$/alive/inspectRefresh', { id: info.id })

            if (isInspectResult(resp)) {
                this.emit('inspectUpdate', resp)
            }
        } catch (err) {
            this.handleError(err)
        }
    }

    inspectRefreshMacro = async (info: InspectInfo) => {
        const resp = await this.doInspectMacro(info.text, info)

        if (isString(resp)) {
            this.emit('inspectUpdate', Object.assign({}, info, { result: resp }))
        }
    }

    inspectMacroInc = async (info: InspectInfo) => {
        const oldResult = isString(info.result) ? info.result : info.text
        const resp = await this.doInspectMacro(oldResult, info)

        if (isString(resp)) {
            this.emit('inspectUpdate', Object.assign({}, info, { result: resp }))
        }
    }

    private doInspect = async (method: string, reqObj: unknown, buildInfoFn: (resp: InspectResult) => InspectInfo) => {
        try {
            const resp = await this.client?.sendRequest(method, reqObj)

            if (isInspectResult(resp)) {
                const info: InspectInfo = buildInfoFn(resp)

                this.emit('inspectResult', info)
            }
        } catch (err) {
            this.handleError(err)
        }
    }

    inspectSymbol = async (symbol: LispSymbol): Promise<void> => {
        return this.doInspect('$/alive/inspectSymbol', { symbol: symbol.name, package: symbol.package }, (resp) => ({
            id: resp.id,
            resultType: resp.resultType,
            result: resp.result,
            text: symbol.name,
            package: symbol.package,
        }))
    }

    inspectMacro = async (text: string, pkgName: string): Promise<void> => {
        return this.doInspect('$/alive/inspectMacro', { text, package: pkgName }, (resp) => ({
            id: resp.id,
            resultType: resp.resultType,
            result: resp.result,
            text: text,
            package: pkgName,
        }))
    }

    inspect = async (text: string, pkgName: string): Promise<void> => {
        return this.doInspect('$/alive/inspect', { text, package: pkgName }, (resp) => ({
            id: resp.id,
            resultType: resp.resultType,
            result: resp.result,
            text: text,
            package: pkgName,
        }))
    }

    eval = async (text: string, pkgName: string, storeResult?: boolean, withOutput: boolean = false): Promise<string | Array<string> | undefined> => {
        try {
            if (withOutput) {
                this.emit('input', text, pkgName)
            }
            const resp = await this.client?.sendRequest('$/alive/eval', { text, package: pkgName, storeResult })

            if (!isObject(resp) || (!isString(resp.text) && !isArray(resp.text, isString))) {
                return
            }

            return resp.text
        } catch (err) {
            this.handleError(err)
        }
    }

    evalWithOutput = async (text: string, pkgName: string, storeResult?: boolean): Promise<void> => {
        const results = await this.eval(text, pkgName, storeResult, true)
        if (results === undefined) {
            return
        }

        const resultsArray = Array.isArray(results) ? results : [results]

        for (const res of resultsArray) {
            this.emit('output', res)
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
                item.exports = item.exports ?? []
                item.nicknames = item.nicknames ?? []

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
            this.handleError(err)
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

    private doGetInfo = async (
        getRange: () => Promise<vscode.Range | undefined>,
        getTextFn: (range: vscode.Range) => string,
        uri: string,
        selection: Pick<vscode.Selection, 'active' | 'isEmpty' | 'start' | 'end'>
    ) => {
        const range = selection.isEmpty ? await getRange() : new vscode.Range(selection.start, selection.end)

        return {
            range,
            text: range ? getTextFn(range) : undefined,
            pkg: range ? await this.getPackage(uri, range.start) : undefined,
        }
    }

    getEvalInfo = async (
        getTextFn: (range: vscode.Range) => string,
        uri: string,
        selection: Pick<vscode.Selection, 'active' | 'isEmpty' | 'start' | 'end'>
    ): Promise<EvalInfo | undefined> => {
        const { text, pkg } = await this.doGetInfo(
            async () => await this.getTopExprRange(uri, selection),
            getTextFn,
            uri,
            selection
        )

        return isString(text) && isString(pkg) ? { text, package: pkg } : undefined
    }

    private doMacroExpand = async (method: string, text: string, pkgName: string) => {
        try {
            const resp = await this.client?.sendRequest(method, { text, package: pkgName })

            if (!isObject(resp) || !isString(resp.text)) {
                return
            }

            return resp.text
        } catch (err) {
            this.handleError(err)
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
        const { range, text, pkg } = await this.doGetInfo(
            async () => await this.getSurroundingExprRange(uri, selection),
            getTextFn,
            uri,
            selection
        )

        return range !== undefined && isString(text) && isString(pkg) ? { range, text, package: pkg } : undefined
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

            await this.client.sendRequest('$/alive/removePackage', {
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
