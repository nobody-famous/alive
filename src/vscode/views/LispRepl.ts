import * as vscode from 'vscode'
import * as path from 'path'
import EventEmitter = require('events')
import { AliveContext } from '../Types'
import { strToHtml } from '../Utils'

interface ReplEvents {
    requestPackage: []
    historyUp: []
    historyDown: []
    userInput: [string]
    eval: [string, string]
}

interface ReplOutput {
    type: string
    text: string
    pkgName?: string
}

export class LispRepl extends EventEmitter<ReplEvents> implements vscode.WebviewViewProvider {
    private view?: Pick<vscode.WebviewView, 'webview'>
    private ctx: AliveContext
    private package: string
    private replOutput: Array<ReplOutput>
    private updateTextId: NodeJS.Timeout | undefined

    constructor(ctx: AliveContext) {
        super()

        this.ctx = ctx
        this.package = 'cl-user'
        this.updateTextId = undefined
        this.replOutput = []
    }

    resolveWebviewView(webviewView: Pick<vscode.WebviewView, 'webview' | 'onDidChangeVisibility'>): void | Thenable<void> {
        this.view = webviewView

        webviewView.webview.options = {
            enableScripts: true,
        }

        webviewView.webview.onDidReceiveMessage(
            (msg: { command: string; text?: string; pkg?: string }) => {
                switch (msg.command) {
                    case 'eval':
                        return this.doEval(msg.text ?? '')
                    case 'requestPackage':
                        return this.emit('requestPackage')
                    case 'historyUp':
                        return this.emit('historyUp')
                    case 'historyDown':
                        return this.emit('historyDown')
                    case 'userInput':
                        return this.emit('userInput', msg.text ?? '')
                }
            },
            undefined,
            this.ctx.subscriptions
        )

        webviewView.onDidChangeVisibility(() => this.restoreState())

        webviewView.webview.html = this.getHtmlForView(webviewView.webview)
    }

    clear() {
        this.replOutput = []
        this.updateWebview()
    }

    restoreState() {
        this.updateWebview()
        this.view?.webview.postMessage({
            type: 'scrollReplView',
        })
    }

    setPackage(pkg: string) {
        this.package = pkg
        this.view?.webview.postMessage({
            type: 'setPackage',
            name: pkg,
        })
    }

    setInput(text: string) {
        this.view?.webview.postMessage({
            type: 'setInput',
            text: text,
        })
    }

    clearInput() {
        this.view?.webview.postMessage({
            type: 'clearInput',
        })
    }

    addInput(text: string, pkgName: string) {
        this.replOutput.push({
            type: 'input',
            text,
            pkgName,
        })

        this.updateWebview()
        this.view?.webview.postMessage({
            type: 'scrollReplView'
        })
    }

    addOutput(text: string) {
        this.replOutput.push({
            type: 'output',
            text,
        })

        this.updateWebview()
        this.view?.webview.postMessage({
            type: 'scrollReplView'
        })
    }

    getUserInput() {
        this.view?.webview.postMessage({
            type: 'getUserInput',
        })
    }

    private updateWebview() {
        if (this.view) {
            this.view.webview.html = this.getHtmlForView(this.view.webview)
        }
    }

    private doEval(text: string) {
        if (text.trim().length != 0) {
            this.emit('eval', this.package, text)
        }
    }

    private renderReplOutput() {
        return this.replOutput.map(({ text, type, pkgName }) => {
            const textHtml = strToHtml(text)
            const packageHtml = (type === 'input' && pkgName) ?
                `<span class="repl-output-package">${strToHtml(pkgName)}</span> ` : ''

            return `
                <div class="repl-${type}-container">
                    <div class="repl-output-item">${packageHtml}${textHtml}</div>
                </div>
            `.trim()
        }).join('\n')
    }

    private getHtmlForView(webview: vscode.Webview): string {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'view.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'view.css'))

        return `<!DOCTYPE html>
                <html>
                <head>
                    <link rel="stylesheet" href="${webview.asWebviewUri(cssPath)}">
                </head>

                <body onfocus="setFocus()">
                    <div id="repl-output" class="repl-output">
                        ${this.renderReplOutput()}
                    </div>
                    <div class="repl-input-box">
                        <div class="repl-input-text-box" id="repl-user-input-box">
                            <div class="repl-input-label">
                                Input >
                            </div>
                            <form id="repl-user-input-form" class="repl-input-form" action="">
                                <input class="repl-input-text" id="repl-user-input" type="text" disabled>
                            </form>
                        </div>
                        <div class="repl-input-text-box">
                            <div class="repl-input-label" onclick="requestPackage()">
                                <span id="repl-package">${this.package}</span>>
                            </div>
                            <form id="repl-input-form" class="repl-input-form" action="">
                                <input class="repl-input-text" id="repl-input-text" type="text">
                            </form>
                        </div>
                    </div>

                    <script src="${webview.asWebviewUri(jsPath)}"></script>
                </body>
                </html>
        `
    }
}
