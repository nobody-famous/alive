import * as vscode from 'vscode'
import * as path from 'path'
import EventEmitter = require('events')
import { AliveContext } from '../Types'

interface ReplEvents {
    requestPackage: []
    historyUp: []
    historyDown: []
    userInput: [string]
    eval: [string, string]
}

interface ReplOutput {
    text: string
    pkgName?: string
}

export class LispRepl extends EventEmitter<ReplEvents> implements vscode.WebviewViewProvider {
    public view?: Pick<vscode.WebviewView, 'webview'>
    private ctx: AliveContext
    private package: string
    private replOutput: Array<ReplOutput>

    constructor(ctx: AliveContext, version: string) {
        super()

        this.ctx = ctx
        this.package = 'cl-user'
        this.replOutput = [
            {
                text: `; Alive REPL (v${version})`,
            },
        ]
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
                    case 'outputConnected':
                        return this.setReplOutput()
                }
            },
            undefined,
            this.ctx.subscriptions
        )

        webviewView.webview.html = this.getHtmlForView(webviewView.webview)
    }

    clear() {
        this.replOutput = []
        this.view?.webview.postMessage({
            type: 'clear',
        })
    }

    toggleWordWrap() {
        this.view?.webview.postMessage({
            type: 'toggleWordWrap',
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

    addOutput(text: string, pkgName?: string) {
        const output = {
            pkgName,
            text,
        }
        this.replOutput.push(output)
        this.sendOutput(output)
    }

    sendOutput(output: ReplOutput) {
        this.view?.webview.postMessage({
            type: 'appendOutput',
            output,
        })
    }

    setReplOutput() {
        this.view?.webview.postMessage({
            type: 'setReplOutput',
            output: this.replOutput,
        })
    }

    private doEval(text: string) {
        if (text.trim().length === 0) {
            this.addOutput(' ')
        } else {
            this.emit('eval', this.package, text)
        }
    }

    private getHtmlForView(webview: vscode.Webview): string {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resources', 'repl', 'view.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resources', 'repl', 'view.css'))

        return `<!DOCTYPE html>
                <html>
                <head>
                    <link rel="stylesheet" href="${webview.asWebviewUri(cssPath)}">
                </head>

                <body onfocus="setFocus()">
                    <repl-view id="repl-view" package="${this.package}"></repl-view>

                    <script src="${webview.asWebviewUri(jsPath)}"></script>
                </body>
                </html>
        `
    }
}
