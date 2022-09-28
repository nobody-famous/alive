import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import EventEmitter = require('events')

export class LispRepl extends EventEmitter implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView
    private ctx: vscode.ExtensionContext
    private package: string

    constructor(ctx: vscode.ExtensionContext) {
        super()

        this.ctx = ctx
        this.package = 'cl-user'
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
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

        webviewView.onDidChangeVisibility((e) => this.restoreState())

        webviewView.webview.html = this.getHtmlForView()
    }

    clear() {
        this.view?.webview.postMessage({
            type: 'clear',
        })
    }

    restoreState() {
        this.view?.webview.postMessage({
            type: 'restoreState',
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

    addText(text: string) {
        this.view?.webview.postMessage({
            type: 'addText',
            text: `${text}${os.EOL}`,
        })
    }

    getUserInput() {
        this.view?.webview.postMessage({
            type: 'getUserInput',
        })
    }

    private doEval(text: string) {
        this.emit('eval', this.package, text)
    }

    private getHtmlForView(): string {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'view.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'view.css'))

        return `<!DOCTYPE html>
                <html>
                <head>
                    <link rel="stylesheet" href="${this.view?.webview.asWebviewUri(cssPath)}">
                </head>

                <body>
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

                    <script src="${this.view?.webview.asWebviewUri(jsPath)}"></script>
                </body>
                </html>
        `
    }
}
