import * as vscode from 'vscode'
import { SwankConn } from '../swank/SwankConn'
import { WebviewPanel } from 'vscode'

export class View {
    conn: SwankConn
    panel: WebviewPanel

    constructor(host: string, port: number) {
        this.conn = new SwankConn(host, port)

        this.panel = vscode.window.createWebviewPanel('clRepl', 'CL Repl', vscode.ViewColumn.Two, {})
    }

    async start() {
        this.conn.on('error', (err) => console.log(err))
        this.conn.on('msg', (msg) => console.log(msg))
        this.conn.on('activate', (event) => console.log(event))
        this.conn.on('debug', (event) => console.log(event))
        this.conn.on('close', () => console.log('Connection closed'))

        try {
            await this.conn.connect()
            this.updateView()
        } catch (err) {
            console.log(err)
        }
    }

    updateView() {
        this.panel.webview.html = this.renderHTML()
    }

    renderBody(): string {
        return 'This is some content'
    }

    renderHTML(): string {
        let html = ''

        html += `${this.htmlOpen()}`
        html += this.renderBody()
        html == this.htmlClose()

        return html
    }

    htmlOpen(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CL Repl</title>
        </head>
        <body>
        `
    }

    htmlClose(): string {
        return `
        </body>
        </html>
        `
    }
}
