import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
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
    type: string
    text: string
    pkgName?: string
}

export class LispRepl extends EventEmitter<ReplEvents> implements vscode.WebviewViewProvider {
    public view?: Pick<vscode.WebviewView, 'webview'>
    private ctx: AliveContext
    private extension: vscode.Extension<unknown>
    private package: string
    private replOutput: Array<ReplOutput>
    private replText: string
    private webviewReady: boolean = false
    private hasBeenCleared: boolean = false

    constructor(ctx: AliveContext, extension: vscode.Extension<unknown>) {
        super()

        this.ctx = ctx
        this.extension = extension
        this.package = 'cl-user'
        this.replOutput = []
        this.replText = ''
    }

    resolveWebviewView(webviewView: Pick<vscode.WebviewView, 'webview' | 'onDidChangeVisibility'>): void | Thenable<void> {
        this.view = webviewView
        this.webviewReady = false

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
                    case 'webviewReady':
                        this.webviewReady = true
                        return this.restoreState()
                }
            },
            undefined,
            this.ctx.subscriptions
        )

        webviewView.onDidChangeVisibility(() => this.restoreState)

        webviewView.webview.html = this.getHtmlForView(webviewView.webview)
    }

    clear() {
        this.hasBeenCleared = true
        this.replOutput = []
        this.replText = ''
        this.view?.webview.postMessage({
            type: 'clear',
        })
    }

    restoreState() {
        if (!this.webviewReady) {
            return
        }

        this.setPackage(this.package)
        this.view?.webview.postMessage({
            type: 'restoreState',
            items: this.replOutput,
            hasBeenCleared: this.hasBeenCleared,
        })
        this.view?.webview.postMessage({
            type: 'setText',
            text: this.replText,
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
            obj: outputObj,
        })

        this.replText = `${this.replText}${pkgName}> ${text}${os.EOL}`
        this.view?.webview.postMessage({
            type: 'setText',
            text: this.replText,
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
            obj: outputObj,
        })

        this.replText = `${this.replText}${text}${os.EOL}`
        this.view?.webview.postMessage({
            type: 'setText',
            text: this.replText,
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
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resources', 'repl', 'view.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resources', 'repl', 'view.css'))
        const scriptUri = webview.asWebviewUri(jsPath)
        const stylesUri = webview.asWebviewUri(cssPath)
        const version = this.extension.packageJSON.version ?? ''

        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <link rel="stylesheet" type="text/css" href="${stylesUri}">
                </head>
                <body>
                    <repl-container init-package="${this.package}" extension-version="${version}"></repl-container>

                    <script src="${scriptUri}"></script>
                </body>
            </html>
        `.trim()
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
                    <textarea id="repl-text" class="repl-text" readonly></textarea>
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
                                <span id="repl-package">${this.package}</span>
                                >
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
