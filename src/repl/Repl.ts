import { View } from './View'
import { SwankConn } from '../swank/SwankConn'
import { ConnInfo } from '../swank/Types'

export class Repl {
    conn: SwankConn
    view: View

    constructor(host: string, port: number) {
        this.conn = new SwankConn(host, port)
        this.view = new View()
    }

    async connect() {
        try {
            this.conn.on('conn-info', (info) => this.handleConnInfo(info))
            this.conn.on('error', (err) => console.log(err))
            this.conn.on('msg', (msg) => console.log(msg))
            this.conn.on('activate', (event) => console.log(event))
            this.conn.on('debug', (event) => console.log(event))
            this.conn.on('close', () => console.log('Connection closed'))

            await this.conn.connect()
        } catch (err) {
            console.log(err)
        }
    }

    handleConnInfo(info: ConnInfo) {
        console.log('handleConnInfo prompt', info.package?.prompt)
        if (info.package?.prompt !== undefined) {
            this.view.setPrompt(info.package.prompt)
        }
    }

    send(text: string) {
        this.view.addLine(text)
    }
}
