import * as vscode from 'vscode'
import * as path from 'path'
import * as event from '../../swank/event'

export class DebugView {
    ctx: vscode.ExtensionContext
    title: string
    panel?: vscode.WebviewPanel
    event: event.Debug

    constructor(ctx: vscode.ExtensionContext, title: string, event: event.Debug) {
        this.ctx = ctx
        this.title = title
        this.event = event
    }

    run() {
        if (this.panel !== undefined) {
            vscode.window.showInformationMessage('Debug panel already exists')
            return
        }

        this.panel = vscode.window.createWebviewPanel('cl-debug', this.title, vscode.ViewColumn.Beside, { enableScripts: true })

        this.renderHtml()
    }

    private renderCondList() {
        let str = ''

        for (const cond of this.event.condition) {
            str += `<div>${cond.replace(/ /g, '&nbsp;')}</div>`
        }

        return str
    }

    private renderCondition() {
        return `
            <div id="condition">
                ${this.renderCondList()}
            </div>
        `
    }

    private renderBtList() {
        let str = ''

        for (const bt of this.event.frames) {
            str += `<div>${bt.num}: ${bt.desc}</div>`
        }

        return str
    }

    private renderBacktrace() {
        return `
            <div id="backtrace">
                ${this.renderBtList()}
            </div>
        `
    }

    private renderRestartList() {
        let str = ''
        let ndx = 0

        for (const restart of this.event.restarts) {
            str += `<div>${ndx}: [${restart.name}] ${restart.desc}</div>`
            ndx += 1
        }

        return str
    }

    private renderRestarts() {
        return `
            <div id="restarts">
                ${this.renderRestartList()}
            </div>
        `
    }

    private renderHtml() {
        if (this.panel === undefined) {
            return
        }

        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'debug', 'debug.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'debug', 'debug.css'))

        this.panel.webview.html = `
            <html>
            <head>
                <link rel="stylesheet" href="${this.panel?.webview.asWebviewUri(cssPath)}">
            </head>
            <body>
                <div id="content">
                    ${this.renderCondition()}
                    ${this.renderRestarts()}
                    ${this.renderBacktrace()}
                </div>

                <script src="${this.panel?.webview.asWebviewUri(jsPath)}"></script>
            </body>
            </html>
        `
    }
}
