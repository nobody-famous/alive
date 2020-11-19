import { EventEmitter } from 'events'
import * as net from 'net'
import { format } from 'util'
import * as event from './event'
import { DebugActivate } from './event'
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
    threadsReq,
    compileFileReq,
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

    constructor(host: string, port: number) {
        super()

        this.host = host
        this.port = port
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.conn = net.createConnection(this.port, this.host, async () => resolve())

            this.conn.on('error', (err) => this.connError(err))
            this.conn.on('close', () => this.connClosed())
            this.conn.on('data', (data) => this.readData(data))
        })
    }

    close() {
        this.conn?.destroy()
    }

    async connectionInfo(pkg?: string): Promise<response.ConnectionInfo> {
        return await this.requestFn(connectionInfoReq, response.ConnectionInfo, pkg)
    }

    async docSymbol(symbol: string, pkg: string): Promise<response.DocSymbol> {
        return await this.requestFn(docSymbolReq, response.DocSymbol, symbol, pkg)
    }

    async completions(prefix: string, pkg: string): Promise<response.Completions> {
        return await this.requestFn(completionsReq, response.Completions, prefix, pkg)
    }

    async opArgsList(name: string, pkg: string): Promise<response.OpArgs> {
        return await this.requestFn(opArgsReq, response.OpArgs, name, pkg)
    }

    async listPackages(pkg?: string): Promise<response.ListPackages> {
        return await this.requestFn(listPackagesReq, response.ListPackages, pkg)
    }

    async setPackage(pkg: string): Promise<response.SetPackage> {
        return await this.requestFn(setPackageReq, response.SetPackage, pkg)
    }

    async compileFile(str: string, pkg?: string): Promise<response.Eval> {
        return await this.requestFn(compileFileReq, response.CompileFile, str, pkg)
    }

    async eval(str: string, pkg?: string): Promise<response.Eval> {
        return await this.requestFn(evalReq, response.Eval, str, pkg)
    }

    async debugAbort(threadID: number): Promise<response.DebuggerAbort> {
        return await this.requestFn(debuggerAbortReq, response.DebuggerAbort, threadID)
    }

    async requestFn(req: (...args: any[]) => SwankRequest, respType: any, ...args: any[]) {
        const request = req(this.nextID(), ...args)
        const resp = await this.sendRequest(request)
        const parsed = respType.parse(resp)

        if (parsed === undefined) {
            throw new Error(`Inavlid response ${format(resp)}`)
        }

        return parsed
    }

    // async listThreads() {
    //     const req = new ThreadsReq(this.nextID())
    //     const resp = await this.sendRequest(req)

    //     return new ThreadsResp(resp)
    // }

    // async debugThread(ndx, file) {
    //     const req = new DebugThreadReq(ndx, file)
    //     return this.sendRequest(req)
    // }

    // async frameLocals(threadID, frameID) {
    //     const req = new FrameLocalsReq(threadID, frameID)
    //     const resp = await this.sendRequest(req)

    //     return new LocalsResp(resp)
    // }

    // async debuggerInfo(threadID, level) {
    //     const req = new DebuggerInfoReq(threadID, 0, 10)
    //     const resp = await this.sendRequest(req)

    //     return new DebuggerInfoResp(resp)
    // }

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
        } else if (event.op === ':NEW-FEATURES') {
            // Ignore
        } else {
            console.log(`processEvent op ${event.op}`)
        }
    }

    processDebugActivate(event: event.DebugActivate) {
        try {
            this.emit('activate', event)
        } catch (err) {
            this.emit('msg', err.toString())
        }
    }

    processDebug(event: event.Debug) {
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
        return new Promise((resolve, reject) => {
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
