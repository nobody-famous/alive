import * as vscode from 'vscode'
import { WebviewPanel } from 'vscode'

export class View {
    panel: WebviewPanel
    body: string[] = []
    prompt: string = ''

    constructor() {
        this.panel = vscode.window.createWebviewPanel('clRepl', 'CL Repl', vscode.ViewColumn.Two, {})
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
        return `
        <style>
        input[type="text"] {
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
        }
        </style>
        `
    }

    renderPromptInput(): string {
        return `<input type="text">`
    }

    renderBody(): string {
        let str = ''

        for (const line of this.body) {
            str += `<div>${line}</div>`
        }

        str += `<div>${this.prompt} >${this.renderPromptInput()}</div>`

        return str
    }

    renderHTML(): string {
        let html = ''

        html += `${this.htmlOpen()}`
        html += this.renderBody()
        html == this.htmlClose()

        return html
    }

    renderHtmlHead(): string {
        return `
        <head>
            <meta charset="UTF-8">
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
