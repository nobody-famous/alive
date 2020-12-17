import { EventEmitter } from 'events'
import * as net from 'net'
import { format } from 'util'
import * as event from './event'
import * as response from './response'
import {
    completionsReq,
    connectionInfoReq,
    evalReq,
    opArgsReq,
    setPackageReq,
    SwankRequest,
    docSymbolReq,
    listPackagesReq,
    debuggerAbortReq,
    compileFileReq,
    nthRestartReq,
    frameLocalsReq,
    framePackageReq,
    frameEvalReq,
    frameRestartReq,
    loadFileReq,
    findDefsReq,
    evalAndGrabReq,
    macroExpandReq,
    macroExpandAllReq,
    disassembleReq,
} from './SwankRequest'
import { SwankResponse } from './SwankResponse'
import { ConnInfo } from './Types'

export interface SwankConn {
    emit(event: 'conn-err', ...args: unknown[]): boolean
    on(event: 'conn-err', listener: (...args: unknown[]) => void): this

    emit(event: 'conn-info', info: ConnInfo): boolean
    on(event: 'conn-info', listener: (info: ConnInfo) => void): this

    emit(event: 'close'): boolean
    on(event: 'close', listener: () => void): this

    emit(event: 'activate', swankEvent: event.DebugActivate): boolean
    on(event: 'activate', listener: (swankEvent: event.DebugActivate) => void): this

    emit(event: 'debug', swankEvent: event.Debug): boolean
    on(event: 'debug', listener: (swankEvent: event.Debug) => void): this

    emit(event: 'debug-return', swankEvent: event.DebugReturn): boolean
    on(event: 'debug-return', listener: (swankEvent: event.DebugReturn) => void): this

    emit(event: 'msg', message: string): boolean
    on(event: 'msg', listener: (message: string) => void): this
}

export class SwankConn extends EventEmitter {
    host: string
    port: number

    trace: boolean = false
    timeout: number = 10000
    conn?: net.Socket

    buffer?: Buffer
    curResponse?: SwankResponse

    handlers: { [index: number]: any } = {}
    timeouts: { [index: number]: NodeJS.Timeout } = {}
    msgID: number = 1
    ignoreDebug: boolean = false
    rejectAbort: boolean = false

    constructor(host: string, port: number) {
        super()

        this.host = host
        this.port = port
    }

    connect() {
        return new Promise<void>((resolve, reject) => {
            this.conn = net.createConnection(this.port, this.host, async () => resolve())

            this.conn.on('error', (err) => this.connError(err))
            this.conn.on('close', () => this.connClosed())
            this.conn.on('data', (data) => this.readData(data))
        })
    }

    close() {
        this.conn?.destroy()
    }

    setIgnoreDebug(ignore: boolean) {
        this.ignoreDebug = ignore
        this.rejectAbort = ignore
    }

    async connectionInfo(pkg?: string): Promise<response.ConnectionInfo | response.Abort> {
        return await this.requestFn(connectionInfoReq, response.ConnectionInfo, pkg)
    }

    async docSymbol(symbol: string, pkg: string): Promise<response.DocSymbol | response.Abort> {
        return await this.requestFn(docSymbolReq, response.DocSymbol, symbol, pkg)
    }

    async completions(prefix: string, pkg: string): Promise<response.Completions | response.Abort> {
        return await this.requestFn(completionsReq, response.Completions, prefix, pkg)
    }

    async opArgsList(name: string, pkg: string): Promise<response.OpArgs | response.Abort> {
        return await this.requestFn(opArgsReq, response.OpArgs, name, pkg)
    }

    async listPackages(pkg?: string): Promise<response.ListPackages | response.Abort> {
        return await this.requestFn(listPackagesReq, response.ListPackages, pkg)
    }

    async setPackage(pkg: string): Promise<response.SetPackage | response.Abort> {
        return await this.requestFn(setPackageReq, response.SetPackage, pkg)
    }

    async compileFile(str: string, pkg?: string): Promise<response.CompileFile | response.Abort> {
        return await this.requestFn(compileFileReq, response.CompileFile, str, pkg)
    }

    async loadFile(path: string, pkg?: string): Promise<response.Eval | response.Abort> {
        return await this.requestFn(loadFileReq, response.Eval, path, pkg)
    }

    async findDefs(str: string, pkg?: string): Promise<response.FindDefs | response.Abort> {
        return await this.requestFn(findDefsReq, response.FindDefs, str, pkg)
    }

    async macroExpand(str: string, pkg?: string): Promise<response.Eval | response.Abort> {
        return await this.requestFn(macroExpandReq, response.Eval, str, pkg)
    }

    async macroExpandAll(str: string, pkg?: string): Promise<response.Eval | response.Abort> {
        return await this.requestFn(macroExpandAllReq, response.Eval, str, pkg)
    }

    async disassemble(str: string, pkg?: string): Promise<response.Eval | response.Abort> {
        return await this.requestFn(disassembleReq, response.Eval, str, pkg)
    }

    async eval(str: string, pkg?: string): Promise<response.Eval | response.Abort> {
        return await this.requestFn(evalReq, response.Eval, str, pkg)
    }

    async evalAndGrab(str: string, pkg?: string): Promise<response.EvalAndGrab | response.Abort> {
        return await this.requestFn(evalAndGrabReq, response.EvalAndGrab, str, pkg)
    }

    async evalInFrame(threadID: number, str: string, frameNum: number, pkg: string): Promise<response.Eval | response.Abort> {
        return await this.requestFn(frameEvalReq, response.Eval, threadID, str, frameNum, pkg)
    }

    async nthRestart(threadID: number, restart: number): Promise<response.DebuggerAbort> {
        return await this.requestFn(nthRestartReq, response.Restart, threadID, restart)
    }

    async debugAbort(threadID: number): Promise<response.DebuggerAbort> {
        return await this.requestFn(debuggerAbortReq, response.DebuggerAbort, threadID)
    }

    async frameLocals(threadID: number, frameNum: number): Promise<response.FrameLocals> {
        return await this.requestFn(frameLocalsReq, response.FrameLocals, threadID, frameNum)
    }

    async framePackage(threadID: number, frameNum: number): Promise<response.FramePackage> {
        return await this.requestFn(framePackageReq, response.FramePackage, threadID, frameNum)
    }

    async frameRestart(threadID: number, frameNum: number): Promise<response.Eval> {
        return await this.requestFn(frameRestartReq, response.Eval, threadID, frameNum)
    }

    async requestFn(req: (...args: any[]) => SwankRequest, respType: any, ...args: any[]) {
        const id = this.nextID()
        const request = req(id, ...args)
        const resp = await this.sendRequest(request)
        let parsed = undefined

        if (resp.info.status === ':OK') {
            parsed = respType.parse(resp)
        } else if (resp.info.status === ':ABORT') {
            parsed = response.Abort.parse(resp)
        } else {
            throw new Error(`Inavlid response ${format(resp)}`)
        }

        if (parsed === undefined) {
            throw new Error(`Inavlid response ${format(resp)}`)
        }

        return parsed
    }

    connError(err: Error) {
        this.emit('conn-err', `REPL Connection error ${err.toString()}`)
    }

    connClosed() {
        this.conn = undefined
        this.emit('close')
    }

    readData(data: Buffer) {
        try {
            this.addToBuffer(data)
            this.readResponses()
        } catch (err) {
            this.emit('conn-err', err)
        }
    }

    addToBuffer(data: Buffer) {
        this.buffer = this.buffer === undefined ? data : Buffer.concat([this.buffer, data])
    }

    readResponses() {
        while (this.buffer !== undefined && this.buffer.length > 0) {
            this.readResponse()

            if (this.curResponse !== undefined && this.curResponse.hasAllData()) {
                if (this.trace) {
                    console.log(`<-- ${this.curResponse.buf?.toString()}`)
                }
                const event = this.curResponse.parse()

                if (event !== undefined) {
                    this.processEvent(event)
                }
                this.curResponse = undefined
            }
        }
    }

    readResponse() {
        if (this.buffer === undefined) {
            return
        }

        if (this.curResponse === undefined) {
            this.curResponse = new SwankResponse()
            this.buffer = this.curResponse.readHeader(this.buffer)
        }

        this.buffer = this.curResponse.addData(this.buffer)
    }

    processEvent(event: event.SwankEvent) {
        if (event === undefined) {
            return
        }

        if (event.op === ':RETURN') {
            this.processReturn(event as event.Return)
        } else if (event.op === ':DEBUG') {
            this.processDebug(event as event.Debug)
        } else if (event.op === ':DEBUG-ACTIVATE') {
            this.processDebugActivate(event as event.DebugActivate)
        } else if (event.op === ':DEBUG-RETURN') {
            this.processDebugReturn(event as event.DebugReturn)
        } else if (event.op === ':NEW-FEATURES') {
            // Ignore
        } else {
            console.log(`processEvent op ${event.op}`)
        }
    }

    processDebugActivate(event: event.DebugActivate) {
        if (this.ignoreDebug) {
            return
        }

        try {
            this.emit('activate', event)
        } catch (err) {
            this.emit('msg', err.toString())
        }
    }

    processDebugReturn(event: event.DebugReturn) {
        try {
            this.emit('debug-return', event)
        } catch (err) {
            this.emit('msg', err.toString())
        }
    }

    async processDebug(event: event.Debug) {
        if (this.ignoreDebug) {
            try {
                await this.debugAbort(event.threadID)
            } catch (err) {
                // Ignore
            }

            return
        }

        this.emit('debug', event)
    }

    handlerDone(id: number) {
        delete this.handlers[id]

        if (id in this.timeouts) {
            clearTimeout(this.timeouts[id])
            delete this.timeouts[id]
        }
    }

    processReturn(event: event.Return) {
        try {
            const { resolve, reject } = this.handlerForID(event.id)
            const status = event.info?.status

            this.handlerDone(event.id)

            if (status === ':ABORT' && this.rejectAbort) {
                return reject(status)
            }

            status === ':OK' || status === ':ABORT' ? resolve(event) : reject(status)
        } catch (err) {
            this.emit('conn-err', err)
        }
    }

    handlerForID(id: number) {
        const handler = this.handlers[id]

        if (handler === undefined) {
            throw `No handler for message ${id}`
        }

        return handler
    }

    async sendRequest(req: SwankRequest): Promise<event.Return> {
        const msg = req.encode()

        await this.writeMessage(msg)

        return this.waitForResponse(req.msgID)
    }

    waitForResponse(id: number): Promise<event.Return> {
        return new Promise((resolve, reject) => {
            this.handlers[id] = { resolve, reject }
        })
    }

    writeMessage(msg: string) {
        return new Promise<void>((resolve, reject) => {
            if (this.conn === undefined) {
                return reject('No connection')
            }

            if (this.trace) {
                console.log(`--> ${msg}`)
            }

            this.conn.write(msg, (err) => {
                if (err) {
                    return reject(err)
                }

                resolve()
            })
        })
    }

    nextID(): number {
        const id = this.msgID

        this.msgID += 1

        return id
    }
}
