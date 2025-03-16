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

    private renderBtList() {
        let str = ''
        let ndx = this.info.stackTrace.length

        const posStr = (file: string | null, pos: vscode.Position | null) => {
            if (file === null) {
                return ''
            }

            let str = strToHtml(file)

            if (pos != null) {
                const lineStr = `${pos.line + 1}`
                const charStr = `${pos.character + 1}`
                str += `:${lineStr}:${charStr}`
            }

            return str
        }

        for (const bt of this.info.stackTrace) {
            const selectClass = bt.file !== null && bt.position !== null ? 'clickable' : ''

            str += `
                <div class="list-item stacktrace-item">
                    <div class="list-item-ndx">${ndx}</div>
                    <div class="list-item-loc ${selectClass}"
                        onclick="jump_to('${strToHtml(bt.file ?? '')}', ${bt.position?.line}, ${bt.position?.character})"
                    >
                        <div class="list-item-fn">${strToHtml(bt.function)}</div>
                        <div class="list-item-file">${posStr(bt.file, bt.position)}</div>
                    </div>
                </div>
            `
            ndx -= 1
        }

        return str
    }

    private renderBacktrace() {
        return `
            <div id="backtrace">
                <div class="title">Backtrace</div>
                <div class="list-box">
                    ${this.renderBtList()}
                </div>
            </div>
        `
    }

    private renderRestartItem(ndx: number, info: RestartInfo) {
        return `
            <div class="list-item restart-item clickable" onclick="restart(${ndx})">
                ${ndx}: [${strToHtml(info.name)}] ${strToHtml(info.description)}
            </div>
        `
    }

    private renderRestartList() {
        let str = ''
        let ndx = 0

        for (const restart of this.info.restarts) {
            str += this.renderRestartItem(ndx, restart)
            ndx += 1
        }

        return str
    }

    private renderHtml(panel: vscode.WebviewPanel) {
        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'debug', 'debug.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'debug', 'debug.css'))

        panel.webview.html = `
            <html>
            <head>
                <link rel="stylesheet" href="${panel.webview.asWebviewUri(cssPath)}">
            </head>
            <body>
                <template id="condition-template">
                    <div>
                        <div class="title">Condition</div>
                        <div class="list-box">
                            <div class="list-item"><slot></slot></div>
                        </div>
                    </div>
                </template>

                <template id="restarts-template">
                    <style>
                        #restarts {
                            margin-bottom: 1.5rem;
                        }
                    </style>

                    <div id="restarts-div">
                        <div class="title">Restarts</div>
                        <div id="box" class="list-box"></div>
                    </div>
                </template>
                
                <template id="restart-item-template">
                    <div id="box" class="list-item restart-item clickable"></div>
                </template>

                <div id="content">
                    <debug-condition>${strToHtml(this.info.message)}</debug-condition>
                    <debug-restarts id="restarts"></debug-restarts>
                    ${this.renderBacktrace()}
                </div>

                <script src="${panel.webview.asWebviewUri(jsPath)}"></script>
            </body>
            </html>
        `
    }
}
