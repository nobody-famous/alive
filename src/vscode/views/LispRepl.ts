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

        setTimeout(() => {
            this.setPackage(this.package)
        }, 100)
    }

    clear() {
        this.view?.webview.postMessage({
            type: 'clear',
        })
    }

    restoreState() {
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
        this.view?.webview.postMessage({
            type: 'appendOutput',
            obj: {
                type: 'input',
                pkgName,
                text,
            }
        })
    }

    addOutput(text: string) {
        this.view?.webview.postMessage({
            type: 'appendOutput',
            obj: {
                type: 'output',
                text,
            }
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

    private getHtmlForView(webview: vscode.Webview): string {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'index.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'index.css'))
        const scriptUri = webview.asWebviewUri(jsPath)
        const stylesUri = webview.asWebviewUri(cssPath)

        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <link rel="stylesheet" type="text/css" href="${stylesUri}">
                </head>
                <body>
                    <div id="root"></div>
                    <script src="${scriptUri}"></script>
                </body>
            </html>
        `.trim()
    }
}
