import { EventEmitter } from 'events'
import * as path from 'path'
import * as vscode from 'vscode'
import { DebugInfo, RestartInfo } from '../Types'
import { strToHtml } from '../Utils'

interface jsMessage {
    command: string
    [index: string]: unknown
}

export class DebugView extends EventEmitter {
    ctx: vscode.ExtensionContext
    title: string
    panel?: vscode.WebviewPanel
    info: DebugInfo
    frameExpanded: { [index: number]: boolean | undefined } = {}
    frameEval: { [index: number]: string | undefined } = {}
    frameInput: { [index: number]: string | undefined } = {}
    viewCol: vscode.ViewColumn

    constructor(ctx: vscode.ExtensionContext, title: string, viewCol: vscode.ViewColumn, info: DebugInfo) {
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

        this.panel.webview.onDidReceiveMessage(
            (msg: jsMessage) => {
                switch (msg.command) {
                    case 'restart':
                        return this.restartCommand(msg)
                    case 'bt_locals':
                        return this.btLocalsCommand(msg)
                    case 'frame_restart':
                        return this.frameRestartCommand(msg)
                    case 'frame_eval':
                        return this.frameValueCommand(msg)
                    case 'input_changed':
                        return this.inputChangedCommand(msg)
                    case 'inspect_cond':
                        return this.inspectCondCommand()
                    case 'jump_to':
                        return this.jumpTo(msg)
                }
            },
            undefined,
            this.ctx.subscriptions
        )

        this.panel.onDidDispose(() => {
            this.emit('debugClosed')
        })

        this.panel.onDidChangeViewState(() => {
            vscode.commands.executeCommand('setContext', 'clDebugViewActive', this.panel?.active)
        })

        this.renderHtml()
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
            this.emit('jump-to', file, line, char)
        }
    }

    setEvalResponse(ndx: number, text: string) {
        this.frameEval[ndx] = text
        this.renderHtml()
    }

    private inspectCondCommand() {
    }

    private frameRestartCommand(msg: jsMessage) {
        if (typeof msg.number === 'number') {
            this.emit('frame-restart', msg.number)
        }
    }

    private inputChangedCommand(msg: jsMessage) {
        const num = typeof msg.number === 'number' ? msg.number : undefined
        const text = typeof msg.text === 'string' ? msg.text : ''

        if (num === undefined) {
            return
        }

        this.frameInput[num] = text
    }

    private frameValueCommand(msg: jsMessage) {
        const num = typeof msg.number === 'number' ? msg.number : undefined
        const text = typeof msg.text === 'string' ? msg.text : ''

        if (num === undefined || text.length === 0) {
            return
        }

        this.emit('frame-eval', num, text)
    }

    private btLocalsCommand(msg: jsMessage) {
        const num = typeof msg.number === 'number' ? msg.number : undefined

        if (num === undefined) {
            return
        }

        if (this.frameExpanded[num] === undefined) {
            this.frameExpanded[num] = false
        }

        this.frameExpanded[num] = !this.frameExpanded[num]

        this.renderHtml()
    }

    private restartCommand(msg: jsMessage) {
        if (typeof msg.number === 'number') {
            this.emit('restart', msg.number)
        }
    }

    private renderCondList() {
        let str = ''

        str += `<div class="list-item">${strToHtml(this.info.message)}</div>`

        return str
    }

    private renderCondition() {
        return `
            <div id="condition">
                <div class="title">Condition</div>
                <div class="list-box">
                    ${this.renderCondList()}
                </div>
            </div>
        `
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
                <div class="list-item">
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
            <div class="list-item clickable" onclick="restart(${ndx})">
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

    private renderRestarts() {
        return `
            <div id="restarts">
                <div class="title">Restarts</div>
                <div class="list-box">
                    ${this.renderRestartList()}
                </div>
            </div>
        `
    }

    private renderHtml() {
        if (this.panel === undefined) {
            vscode.window.showInformationMessage('Panel not undefined')
            return
        }

        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'debug', 'debug.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'debug', 'debug.css'))

        this.panel.webview.html = `
            <html>
            <head>
                <link rel="stylesheet" href="${this.panel?.webview.asWebviewUri(cssPath)}">
            </head>
            <body>
                <div id="content">
                    ${this.renderCondition()}
                    ${this.renderRestarts()}
                    ${this.renderBacktrace()}
                </div>

                <script src="${this.panel?.webview.asWebviewUri(jsPath)}"></script>
            </body>
            </html>
        `
    }
}
