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

    private getHtmlForView(): string {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'view.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'repl', 'view.css'))

        return `<!DOCTYPE html>
                <head>
                    <link rel="stylesheet" href="${this.view?.webview.asWebviewUri(cssPath)}">
                </head>

                <html>
                    <div class="repl-text">Output goes here</div>
                    <div>Text box goes here</div>
                </html>
        `
    }
}
