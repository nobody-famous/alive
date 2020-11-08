import { EventEmitter } from 'events'
import { allLabels } from '../../lisp/keywords'
import { SwankConn } from '../../swank/SwankConn'
import { ConnInfo } from '../../swank/Types'
import { FileView } from './FileView'
import { View } from './View'

export class Repl extends EventEmitter {
    conn: SwankConn
    view: View
    kwDocs: { [index: string]: string } = {}

    constructor(host: string, port: number) {
        super()

        this.view = new FileView(host, port)

        this.conn = new SwankConn(host, port)
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
            await this.view.open()

            const resp = await this.conn.connectionInfo()
            this.handleConnInfo(resp.info)

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

            const resp = await this.conn.docSymbol(symbol, ':cl-user')
            return resp.doc
        } catch (err) {
            return ''
        }
    }

    async getCompletions(prefix: string): Promise<string[]> {
        try {
            const resp = await this.conn.completions(prefix, ':cl-user')
            return resp.strings
        } catch (err) {
            return []
        }
    }

    async getOpArgs(name: string): Promise<string> {
        try {
            const resp = await this.conn.opArgsList(name, ':cl-user')
            return resp.desc
        } catch (err) {
            return ''
        }
    }

    async send(text: string) {
        try {
            const resp = await this.conn.eval(text)

            this.view.addText(resp.result.join(''))
        } catch (err) {
            this.emit('error', err)
        }
    }
}
