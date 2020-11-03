import { EventEmitter } from 'events'
import * as vscode from 'vscode'
import { allLabels } from '../../lisp/keywords'
import { SwankConn } from '../../swank/SwankConn'
import { ConnInfo } from '../../swank/Types'
import { View } from './View'

export class Repl extends EventEmitter {
    conn: SwankConn
    view: View
    kwDocs: { [index: string]: string } = {}

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
            await this.getKwDocs()
        } catch (err) {
            console.log(err)
        }
    }

    async getKwDocs() {
        for (const label of allLabels) {
            const resp = await this.conn.docSymbol(label, ':cl-user')

            this.kwDocs[label] = resp.doc
        }
    }

    onClose() {
        this.view.close()
        this.emit('close')
    }

    handleConnInfo(info: ConnInfo) {
        if (info.package?.prompt !== undefined) {
            this.view.setPrompt(info.package.prompt)
        }
    }

    async getDoc(symbol: string): Promise<string> {
        try {
            if (symbol in this.kwDocs) {
                return this.kwDocs[symbol]
            }

            return 'Not Documented'
        } catch (err) {
            return ''
        }
    }

    async getCompletions(): Promise<string[]> {
        try {
            const resp = await this.conn.completions('', ':cl-user')
            return resp.strings
        } catch (err) {
            return []
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
