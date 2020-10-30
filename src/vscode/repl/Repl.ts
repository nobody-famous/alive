import * as vscode from 'vscode'
import { SwankConn } from '../../swank/SwankConn'
import { ConnInfo } from '../../swank/Types'
import { View } from './View'
import { EventEmitter } from 'events'

export class Repl extends EventEmitter {
    conn: SwankConn
    view: View

    constructor(ctx: vscode.ExtensionContext, host: string, port: number) {
        super()

        this.conn = new SwankConn(host, port)
        this.view = new View(ctx)
    }

    async connect() {
        try {
            this.conn.on('conn-info', (info) => this.handleConnInfo(info))
            this.conn.on('conn-err', (err) => console.log(err))
            this.conn.on('msg', (msg) => console.log(msg))
            this.conn.on('activate', (event) => console.log(event))
            this.conn.on('debug', (event) => console.log(event))
            this.conn.on('close', () => this.onClose())

            await this.conn.connect()
        } catch (err) {
            console.log(err)
        }
    }

    onClose() {
        console.log('Connection Closed')
        this.view.close()
        this.emit('close')
    }

    handleConnInfo(info: ConnInfo) {
        if (info.package?.prompt !== undefined) {
            this.view.setPrompt(info.package.prompt)
        }
    }

    async send(text: string) {
        try {
            const resp = await this.conn.eval(text)

            for (const line of resp.result) {
                this.view.addLine(line)
            }
        } catch (err) {
            this.emit('error', err)
        }
    }
}
