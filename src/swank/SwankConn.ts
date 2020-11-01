import { EventEmitter } from 'events'
import * as net from 'net'
import { format } from 'util'
import * as response from './response'
import { ConnectionInfo } from './response'
import * as event from './event'
import { ConnectionInfoReq, EvalReq, SwankRequest } from './SwankRequest'
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
        const req = new ConnectionInfoReq(this.nextID(), pkg)
        const resp = await this.sendRequest(req)
        const info = ConnectionInfo.parse(resp)

        if (info === undefined) {
            throw new Error(`Connection Info invalid response ${format(resp)}`)
        }

        return info
    }

    async eval(str: string, pkg?: string): Promise<response.Eval> {
        const req = new EvalReq(this.nextID(), str, pkg)
        const resp = await this.sendRequest(req)
        const evalResp = response.Eval.parse(resp)

        if (evalResp === undefined) {
            throw new Error(`Eval invalid response ${format(resp)}`)
        }

        return evalResp
    }

    // async listThreads() {
    //     const req = new ThreadsReq()
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

            status === ':OK' ? resolve(event) : reject(status)
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

            this.timeouts[id] = setTimeout(() => {
                if (id in this.handlers) {
                    delete this.handlers[id]
                    reject('Timed Out')
                }
            }, 1000)
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
