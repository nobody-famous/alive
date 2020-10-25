import { EventEmitter } from 'events'
import * as net from 'net'
import { ConnectionInfoReq, EvalReq, SwankRequest } from './SwankRequest'
import { ConnectionInfoResp, EvalResp, SwankResponse } from './SwankResponse'
import { SwankEvent } from './SwankEvent'
import { ReturnEvent } from './ReturnEvent'

export class SwankConn extends EventEmitter {
    host: string
    port: number

    trace: boolean
    conn?: net.Socket
    info?: ConnectionInfoResp

    buffer?: Buffer
    curResponse?: SwankResponse

    handlers: { [index: number]: any }
    msgID: number

    constructor(host: string, port: number) {
        super()

        this.host = host
        this.port = port

        this.trace = false

        this.conn = undefined
        this.info = undefined
        this.handlers = {}
        this.msgID = 1
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.conn = net.createConnection(this.port, this.host, async () => {
                try {
                    this.info = await this.connectionInfo()
                } catch (err) {
                    return reject(`Failed to get connection info ${err.toString()}`)
                }
                resolve()
            })

            this.conn.on('error', (err) => this.connError(err))
            this.conn.on('close', () => this.connClosed())
            this.conn.on('data', (data) => this.readData(data))
        })
    }

    async connectionInfo() {
        const req = new ConnectionInfoReq()
        const resp = await this.sendRequest(req)

        return new ConnectionInfoResp(resp)
    }

    async eval(str: string) {
        const req = new EvalReq(str)
        const resp = await this.sendRequest(req)

        return new EvalResp(resp)
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
        this.emit('error', `REPL Connection error ${err.toString()}`)
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
            this.emit('error', err)
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

    processEvent(event: SwankEvent) {
        if (event === undefined) {
            return
        }

        if (event.op === ':RETURN') {
            this.processReturn(event as ReturnEvent)
        } else if (event.op === ':DEBUG') {
            this.processDebug(event)
        } else if (event.op === ':DEBUG-ACTIVATE') {
            this.processDebugActivate(event)
        } else {
            console.log(`processEvent op ${event.op}`)
        }
    }

    processDebugActivate(event: SwankEvent) {
        try {
            this.emit('activate', event)
        } catch (err) {
            this.emit('msg', err.toString())
        }
    }

    processDebug(event: SwankEvent) {
        this.emit('debug', event)
    }

    processReturn(event: ReturnEvent) {
        try {
            const { resolve, reject } = this.handlerForID(event.id)
            const status = event.info?.status
            const args = event.info?.args

            if (status === ':OK') {
                resolve(args)
            } else {
                reject(status)
            }

            delete this.handlers[event.id]
        } catch (err) {
            this.emit('error', err)
        }
    }

    handlerForID(id: number) {
        const handler = this.handlers[id]

        if (handler === undefined) {
            throw `No handler for message ${id}`
        }

        return handler
    }

    async sendRequest(req: SwankRequest): Promise<any> {

        const id = this.nextID()
        const msg = req.encode(id)

        await this.writeMessage(msg)

        return this.waitForResponse(id)
    }

    waitForResponse(id: number): Promise<any> {
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
