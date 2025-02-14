import * as vscode from 'vscode'
import * as path from 'path'
import EventEmitter = require('events')
import { AliveContext } from '../Types'
import { getNonce } from '../Utils'

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

    constructor(ctx: AliveContext) {
        super()

        this.ctx = ctx
        this.package = 'cl-user'
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

        webviewView.webview.html = this.getWebviewContent(webviewView.webview)

        setTimeout(() => {
            this.setPackage(this.package)
        }, 200)
    }

    clear() {
        this.replOutput = []
        this.view?.webview.postMessage({
            type: 'clear',
        })
    }

    restoreState() {
        this.setPackage(this.package)
        this.view?.webview.postMessage({
            type: 'setOutput',
            items: this.replOutput
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
        const outputObj = {
            type: 'input',
            pkgName,
            text,
        }
        this.replOutput.push(outputObj)
        this.view?.webview.postMessage({
            type: 'appendOutput',
            obj: outputObj
        })
    }

    addOutput(text: string) {
        const outputObj = {
            type: 'output',
            text,
        }
        this.replOutput.push(outputObj)
        this.view?.webview.postMessage({
            type: 'appendOutput',
            obj: outputObj
        })
    }

    getUserInput() {
        this.view?.webview.postMessage({
            type: 'getUserInput',
        })
    }

    private doEval(text: string) {
        if (text.trim().length != 0) {
            this.emit('eval', this.package, text)
        }
    }

    private getWebviewContent(webview: vscode.Webview): string {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resources', 'repl', 'index.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resources', 'repl', 'index.css'))
        const scriptUri = webview.asWebviewUri(jsPath)
        const stylesUri = webview.asWebviewUri(cssPath)

        const nonce = getNonce()

        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                    <link rel="stylesheet" type="text/css" href="${stylesUri}">
                </head>
                <body>
                    <div id="root"></div>
                    <script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
            </html>
        `.trim()
    }
}
