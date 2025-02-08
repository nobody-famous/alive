import * as vscode from 'vscode'
import * as path from 'path'
import EventEmitter = require('events')
import { AliveContext } from '../Types'

interface PanelEvents {
    requestPackage: []
    inspect: [string, string]
}

export class InspectorPanel extends EventEmitter<PanelEvents> implements vscode.WebviewViewProvider {
    private view?: Pick<vscode.WebviewView, 'webview'>
    private ctx: AliveContext
    private package: string

    constructor(ctx: AliveContext) {
        super()

        this.ctx = ctx
        this.package = 'cl-user'
    }

    resolveWebviewView(webviewView: Pick<vscode.WebviewView, 'webview'>): void | Thenable<void> {
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
                }
            },
            undefined,
            this.ctx.subscriptions
        )

        webviewView.webview.html = this.getHtmlForView(webviewView.webview)
    }

    setPackage(pkg: string) {
        this.package = pkg
        this.view?.webview.postMessage({
            type: 'setPackage',
            name: pkg,
        })
    }

    private doEval(text: string) {
        this.emit('inspect', this.package, text)
    }

    private getHtmlForView(webview: vscode.Webview): string {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'inspectorPanel', 'view.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'inspectorPanel', 'view.css'))

        return `<!DOCTYPE html>
                <html>
                <head>
                    <link rel="stylesheet" href="${webview.asWebviewUri(cssPath)}">
                </head>

                <body>
                    <div class="inspector-panel-input-box">
                        <div class="inspector-panel-input-text-box">
                            <div class="inspector-panel-input-label" onclick="requestPackage()">
                                <span id="inspector-panel-package">${this.package}</span>
                            </div>
                            <form id="inspector-panel-input-form" class="inspector-panel-input-form" action="">
                                <input class="inspector-panel-input-text" id="inspector-panel-input-text" type="text">
                            </form>
                        </div>
                    </div>

                    <script src="${webview.asWebviewUri(jsPath)}"></script>
                </body>
                </html>
        `
    }
}
