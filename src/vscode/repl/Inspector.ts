import { EventEmitter } from 'events'
import * as path from 'path'
import * as vscode from 'vscode'
import { unescape } from '../../lisp'
import { InspectContent, InspectContentAction } from '../../swank/Types'

export class Inspector extends EventEmitter {
    ctx: vscode.ExtensionContext
    viewCol: vscode.ViewColumn
    panel?: vscode.WebviewPanel

    title?: string
    content?: InspectContent

    constructor(ctx: vscode.ExtensionContext, viewCol: vscode.ViewColumn) {
        super()

        this.ctx = ctx
        this.viewCol = viewCol
    }

    show(title: string, content: InspectContent) {
        this.title = title
        this.content = content

        if (this.panel !== undefined) {
            this.stop()
        }

        this.initPanel(title)
        this.renderHtml()
    }

    stop() {
        this.panel?.dispose()
        this.panel = undefined
        vscode.commands.executeCommand('setContext', 'clInspectorActive', false)
    }

    private initPanel(title: string) {
        this.panel = vscode.window.createWebviewPanel('cl-inspector', title, this.viewCol, { enableScripts: true })

        this.panel.webview.onDidReceiveMessage((msg: { command: string; index: number }) => {
            switch (msg.command.toUpperCase()) {
                case 'VALUE':
                    return this.emit('inspect-part', msg.index)
                case 'ACTION':
                    return this.emit('inspector-action', msg.index)
            }
        })

        this.panel.onDidChangeViewState(() => {
            vscode.commands.executeCommand('setContext', 'clInspectorActive', this.panel?.active)
        })
    }

    private renderAction(item: InspectContentAction) {
        const display = this.escapeHtml(unescape(item.display))
        const actName = item.action.toUpperCase()
        let btnClass = ''
        let btnClick = ''
        let str = ''

        if (actName === 'ACTION') {
            btnClass = 'inspect-btn-action'
            btnClick = `inspect_action(${item.index})`
        } else if (actName === 'VALUE') {
            btnClass = 'inspect-btn-value'
            btnClick = `inspect_value(${item.index})`
        }

        str += `
            <div class="inspect-action-box">
                <button class="${btnClass}" onclick="${btnClick}">${display}</button>
            </div>
        `

        return str
    }

    private renderContent() {
        if (this.content === undefined) {
            return ''
        }

        const display = this.content.display
        let str = ''
        let opened = false

        for (const item of display) {
            if (typeof item === 'string') {
                if (opened) {
                    str += '</div>'
                    opened = false
                }

                opened = true

                str += `<div class="inspect-item">`
                str += item
            } else if ('display' in item) {
                str += this.renderAction(item)
            }
        }

        return str
    }

    private escapeHtml(text: string) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#39;')
    }

    private renderHtml() {
        if (this.panel === undefined || this.title === undefined || this.content === undefined) {
            vscode.window.showInformationMessage('Inspector not initialized')
            return
        }

        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'inspector', 'inspect.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'inspector', 'inspect.css'))

        this.panel.webview.html = `
            <html>
            <head>
                <link rel="stylesheet" href="${this.panel?.webview.asWebviewUri(cssPath)}">
            </head>
            <body>
                <div id="content">
                    <div class="inspect-title">${this.escapeHtml(this.title)}</div>
                    <hr></hr>
                    <div class="inspect-content">${this.renderContent()}</div>
                </div>

                <script src="${this.panel?.webview.asWebviewUri(jsPath)}"></script>
            </body>
            </html>
        `
    }
}
