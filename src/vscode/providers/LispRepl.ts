import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import EventEmitter = require('events')

export class LispRepl extends EventEmitter implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView
    private ctx: vscode.ExtensionContext

    constructor(ctx: vscode.ExtensionContext) {
        super()

        this.ctx = ctx
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
                        return this.doEval(msg.text ?? '', msg.pkg ?? '')
                }
            },
            undefined,
            this.ctx.subscriptions
        )

        webviewView.webview.html = this.getHtmlForView()
    }

    setPackages(pkgs: string[]) {
        this.view?.webview.postMessage({
            type: 'setPackages',
            pkgs,
        })
    }

    addText(text: string) {
        this.view?.webview.postMessage({
            type: 'addText',
            text: `${text}${os.EOL}`,
        })
    }

    private doEval(text: string, pkg: string) {
        this.emit('eval', pkg, text)
    }

    private getPackageDropdown(): string {
        return `
        <select class="repl-input-pkg" name="package" id="repl-input-pkg">
        </select>
        `
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
                        <div class="repl-input-pkg-box">in-package: ${this.getPackageDropdown()}</div>
                        <div class="repl-input-text-box">
                            <div class="repl-input-label">></div>
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
