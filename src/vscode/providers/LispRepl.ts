import * as vscode from 'vscode'
import * as path from 'path'

export class LispRepl implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView
    private ctx: vscode.ExtensionContext

    constructor(ctx: vscode.ExtensionContext) {
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

        webviewView.webview.html = this.getHtmlForView()
    }

    private getTextLines(): string {
        let lines = ''

        for (let line = 1; line < 20; line += 1) {
            lines += `<div class="repl-text-item">Line ${line}</div>`
        }

        return lines
    }

    private getPackageDropdown(): string {
        return `
        <select class="repl-input-pkg" name="package" id="package">
            <option value="foo">foo</option>
            <option value="alive/lsp/message/alive/unexport-symbol">alive/lsp/message/alive/unexport-symbol</option>
        </select>
        `
    }

    private getHtmlForView(): string {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'view.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'view.css'))

        return `<!DOCTYPE html>
                <head>
                    <link rel="stylesheet" href="${this.view?.webview.asWebviewUri(cssPath)}">
                </head>

                <html>
                    <div class="repl-text-box">${this.getTextLines()}</div>
                    <div class="repl-input-box">
                        <div class="repl-input-pkg-box">in-package: ${this.getPackageDropdown()}</div>
                        <div class="repl-input-text-box">
                            <div class="repl-input-label">></div>
                            <input class="repl-input-text" type="text">
                        </div>
                    </div>
                </html>
        `
    }
}
