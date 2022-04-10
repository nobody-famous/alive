import * as vscode from 'vscode'
import * as path from 'path'
import { Backend } from '../Types'

export class LispRepl implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView
    private be: Backend
    private ctx: vscode.ExtensionContext
    private lines: string[] = []

    constructor(ctx: vscode.ExtensionContext, be: Backend) {
        this.ctx = ctx
        this.be = be
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
                console.log('MSG', msg)
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

    addLine(line: string) {
        this.lines.push(line)

        this.updateView()
    }

    private updateView() {
        if (this.view !== undefined) {
            this.view.webview.html = this.getHtmlForView()
        }
    }

    private doEval(text: string, pkg: string) {
        this.be.eval(text, pkg)
    }

    private getTextLines(): string {
        return this.lines.map((line) => `<div class="repl-text-item">Line ${line}</div>`).join('')
    }

    private getPackageDropdown(): string {
        return `
        <select class="repl-input-pkg" name="package" id="repl-input-pkg">
            <option value="foo">foo</option>
            <option value="alive/lsp/message/alive/unexport-symbol">alive/lsp/message/alive/unexport-symbol</option>
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
                    <div class="repl-text-box">
                        <div class="repl-text-lines">
                            ${this.getTextLines()}
                        </div>
                    </div>
                    <div class="repl-input-box">
                        <div class="repl-input-pkg-box">in-package: ${this.getPackageDropdown()}</div>
                        <div class="repl-input-text-box">
                            <div class="repl-input-label">></div>
                            <form id="repl-input-form" action="">
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
