import { EventEmitter } from 'events'
import * as path from 'path'
import * as vscode from 'vscode'
import { AliveContext, DebugInfo, RestartInfo } from '../Types'
import { strToHtml } from '../Utils'
import { isFiniteNumber } from '../Guards'

export interface jsMessage {
    command: string
    [index: string]: unknown
}

interface DebugEvents {
    debugClosed: []
    jumpTo: [string, number, number]
    restart: [number]
}

export class DebugView extends EventEmitter<DebugEvents> {
    ctx: AliveContext
    title: string
    panel?: vscode.WebviewPanel
    info: DebugInfo
    frameEval: { [index: number]: string | undefined } = {}
    frameInput: { [index: number]: string | undefined } = {}
    viewCol: vscode.ViewColumn

    constructor(ctx: AliveContext, title: string, viewCol: vscode.ViewColumn, info: DebugInfo) {
        super()

        this.ctx = ctx
        this.title = title
        this.viewCol = viewCol
        this.info = info
    }

    run() {
        if (this.panel !== undefined) {
            this.panel.dispose()
        }

        this.panel = vscode.window.createWebviewPanel(
            'cl-debug',
            this.title,
            { preserveFocus: true, viewColumn: this.viewCol },
            { enableScripts: true }
        )

        this.setPanelCallbacks(this.panel)

        this.renderHtml(this.panel)

        this.panel.webview.postMessage({
            type: 'hydrate',
            restarts: this.info.restarts,
            backtrace: this.info.stackTrace,
        })
    }

    private setPanelCallbacks(panel: vscode.WebviewPanel) {
        panel.webview.onDidReceiveMessage(
            (msg: jsMessage) => {
                switch (msg.command) {
                    case 'restart':
                        return this.restartCommand(msg)
                    case 'inspect_cond':
                        return this.inspectCondCommand()
                    case 'jump_to':
                        return this.jumpTo(msg)
                }
            },
            undefined,
            this.ctx.subscriptions
        )

        panel.onDidDispose(() => {
            vscode.commands.executeCommand('setContext', 'aliveDebugViewActive', false)
            this.emit('debugClosed')
        })

        panel.onDidChangeViewState(() => {
            vscode.commands.executeCommand('setContext', 'aliveDebugViewActive', panel.visible)
        })
    }

    stop() {
        this.panel?.dispose()
        this.panel = undefined
    }

    jumpTo(msg: jsMessage) {
        const file = typeof msg.file === 'string' ? msg.file : undefined
        const line = typeof msg.line === 'number' ? msg.line : undefined
        const char = typeof msg.char === 'number' ? msg.char : undefined

        if (file !== undefined && line !== undefined && char !== undefined) {
            this.emit('jumpTo', file, line, char)
        }
    }

    selectRestart(num: number) {
        this.emit('restart', num)
    }

    private inspectCondCommand() {}

    private restartCommand(msg: jsMessage) {
        if (isFiniteNumber(msg.number)) {
            this.selectRestart(msg.number)
        }
    }

    private renderHtml(panel: vscode.WebviewPanel) {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resources', 'debug', 'debug.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resources', 'debug', 'debug.css'))

        panel.webview.html = `
            <html>
            <head>
                <link rel="stylesheet" href="${panel.webview.asWebviewUri(cssPath)}">
            </head>
            <body>
                <div id="content">
                    <debug-condition>${strToHtml(this.info.message)}</debug-condition>
                    <debug-restarts id="restarts"></debug-restarts>
                    <debug-backtrace id="backtrace"></debug-backtrace>
                </div>

                <script src="${panel.webview.asWebviewUri(jsPath)}"></script>
            </body>
            </html>
        `
    }
}
