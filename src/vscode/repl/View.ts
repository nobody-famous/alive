import * as vscode from 'vscode'
import * as path from 'path'
import { WebviewPanel } from 'vscode'

export class View {
    panel: WebviewPanel
    body: string[] = []
    prompt: string = ''
    cssUri: vscode.Uri
    jsUri: vscode.Uri

    constructor(ctx: vscode.ExtensionContext) {
        const opts = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(ctx.extensionPath, 'resource'))],
        }

        const cssFileUri = vscode.Uri.file(path.join(ctx.extensionPath, 'resource', 'repl', 'view.css'))
        const jsFileUri = vscode.Uri.file(path.join(ctx.extensionPath, 'resource', 'repl', 'view.js'))

        this.panel = vscode.window.createWebviewPanel('clRepl', 'CL Repl', vscode.ViewColumn.Two, opts)
        this.cssUri = this.panel.webview.asWebviewUri(cssFileUri)
        this.jsUri = this.panel.webview.asWebviewUri(jsFileUri)
    }

    close() {
        this.panel.dispose()
    }

    setPrompt(prompt: string) {
        this.prompt = prompt
        this.updateView()
    }

    addLine(line: string) {
        this.body.push(line)
        this.updateView()
    }

    updateView() {
        this.panel.webview.html = this.renderHTML()
    }

    renderStyle(): string {
        return `<link rel="stylesheet" href="${this.cssUri}">`
    }

    renderScript(): string {
        return `<script type="text/javascript" src="${this.jsUri}"></script>`
    }

    renderPromptInput(): string {
        return `<textarea id="replInput" rows="3" autofocus></textarea>`
    }

    renderPrompt(): string {
        let str = '<table>'

        str += '<tbody>'
        str += '<tr>'
        str += '<td id="prompt">'
        str += `${this.prompt} >`
        str += '</td>'
        str += '<td id="prompt-input">'
        str += this.renderPromptInput()
        str += '</td>'
        str += '</tr>'
        str += '</tbody>'
        str += '</table>'

        return str
    }

    renderBody(): string {
        let str = '<body>'

        for (const line of this.body) {
            str += `<div>${line}</div>`
        }

        str += this.renderPrompt()
        str += '</body>'

        return str
    }

    renderHTML(): string {
        let html = ''

        html += `${this.htmlOpen()}`
        html += this.renderBody()
        html += this.renderScript()
        html == this.htmlClose()

        return html
    }

    renderHtmlHead(): string {
        const webview = this.panel.webview
        const imgSrc = `img-src ${webview.cspSource}`
        const scriptSrc = `script-src ${webview.cspSource}`
        const styleSrc = `style-src ${webview.cspSource}`

        return `
        <head>
            <meta charset="UTF-8">
            <meta
                http-equiv="Content-Security-Policy"
                content="default-src 'none'; ${imgSrc} https:; ${scriptSrc}; ${styleSrc};"
            />
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CL Repl</title>
            ${this.renderStyle()}
        </head>
        `
    }

    htmlOpen(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        ${this.renderHtmlHead()}
        `
    }

    htmlClose(): string {
        return `
        </html>
        `
    }
}
