import * as vscode from 'vscode'
import * as path from 'path'
import * as event from '../../swank/event'

export class DebugView {
    ctx: vscode.ExtensionContext
    title: string
    panel?: vscode.WebviewPanel
    event: event.Debug
    viewCol: vscode.ViewColumn

    constructor(ctx: vscode.ExtensionContext, title: string, viewCol: vscode.ViewColumn, event: event.Debug) {
        this.ctx = ctx
        this.title = title
        this.viewCol = viewCol
        this.event = event
    }

    run() {
        if (this.panel !== undefined) {
            vscode.window.showInformationMessage('Debug panel already exists')
            return
        }

        this.panel = vscode.window.createWebviewPanel('cl-debug', this.title, this.viewCol, { enableScripts: true })

        this.panel.onDidChangeViewState(() => {
            vscode.commands.executeCommand('setContext', 'clDebugViewActive', this.panel?.active)
        })

        this.renderHtml()
    }

    stop() {
        this.panel?.dispose()
        this.panel = undefined
    }

    private renderCondList() {
        let str = ''

        for (const cond of this.event.condition) {
            str += `<div class="list-item">${cond.replace(/ /g, '&nbsp;')}</div>`
        }

        return str
    }

    private renderCondition() {
        return `
            <div id="condition">
                <div class="title">Condition</div>
                <div class="list-box">
                    ${this.renderCondList()}
                </div>
            </div>
        `
    }

    private renderBtList() {
        let str = ''

        for (const bt of this.event.frames) {
            str += `<div class="list-item">${bt.num}: ${bt.desc}</div>`
        }

        return str
    }

    private renderBacktrace() {
        return `
            <div id="backtrace">
                <div class="title">Backtrace</div>
                <div class="list-box">
                    ${this.renderBtList()}
                </div>
            </div>
        `
    }

    private renderRestartList() {
        let str = ''
        let ndx = 0

        for (const restart of this.event.restarts) {
            str += `<div class="list-item">${ndx}: [${restart.name}] ${restart.desc}</div>`
            ndx += 1
        }

        return str
    }

    private renderRestarts() {
        return `
            <div id="restarts">
                <div class="title">Restarts</div>
                <div class="list-box">
                    ${this.renderRestartList()}
                </div>
            </div>
        `
    }

    private renderHtml() {
        if (this.panel === undefined) {
            vscode.window.showInformationMessage('Panel not undefined')
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
