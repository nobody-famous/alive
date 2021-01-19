import { EventEmitter } from 'events'
import * as path from 'path'
import * as vscode from 'vscode'
import * as event from '../../swank/event'
import { Frame, FrameVariable } from '../../swank/Types'

export class DebugView extends EventEmitter {
    ctx: vscode.ExtensionContext
    title: string
    panel?: vscode.WebviewPanel
    event: event.Debug
    activate?: event.DebugActivate
    frameExpanded: { [index: number]: boolean | undefined } = {}
    frameLocals: { [index: number]: FrameVariable[] | undefined } = {}
    frameEval: { [index: number]: string | undefined } = {}
    frameInput: { [index: number]: string | undefined } = {}
    viewCol: vscode.ViewColumn

    constructor(ctx: vscode.ExtensionContext, title: string, viewCol: vscode.ViewColumn, event: event.Debug) {
        super()

        this.ctx = ctx
        this.title = title
        this.viewCol = viewCol
        this.event = event
    }

    run() {
        if (this.panel !== undefined) {
            this.panel.dispose()
        }

        this.panel = vscode.window.createWebviewPanel('cl-debug', this.title, this.viewCol, { enableScripts: true })

        this.panel.webview.onDidReceiveMessage(
            (msg: { command: string; number: number; text?: string }) => {
                switch (msg.command) {
                    case 'restart':
                        return this.restartCommand(msg.number)
                    case 'bt_locals':
                        return this.btLocalsCommand(msg.number)
                    case 'frame_restart':
                        return this.frameRestartCommand(msg.number)
                    case 'frame_eval':
                        return this.frameValueCommand(msg.number, msg.text ?? '')
                    case 'input_changed':
                        return this.inputChangedCommand(msg.number, msg.text ?? '')
                }
            },
            undefined,
            this.ctx.subscriptions
        )

        this.panel.onDidChangeViewState(() => {
            vscode.commands.executeCommand('setContext', 'clDebugViewActive', this.panel?.active)
        })

        this.renderHtml()
    }

    stop() {
        this.panel?.dispose()
        this.panel = undefined
    }

    setLocals(ndx: number, locals: FrameVariable[]) {
        this.frameLocals[ndx] = locals
        this.renderHtml()
    }

    setEvalResponse(ndx: number, text: string) {
        this.frameEval[ndx] = text
        this.renderHtml()
    }

    private frameRestartCommand(num: number) {
        this.emit('frame-restart', num)
    }

    private inputChangedCommand(num: number, text: string) {
        this.frameInput[num] = text
    }

    private frameValueCommand(num: number, text: string) {
        if (text.length === 0) {
            return
        }

        this.emit('frame-eval', num, text)
    }

    private btLocalsCommand(num: number) {
        if (this.frameExpanded[num] === undefined) {
            this.frameExpanded[num] = false
        }

        this.frameExpanded[num] = !this.frameExpanded[num]

        if (this.frameLocals[num] === undefined) {
            this.emit('frame-locals', num)
        }

        this.renderHtml()
    }

    private restartCommand(num: number) {
        const restart = this.event.restarts[num]
        this.emit('restart', num, restart)
    }

    private renderCondList() {
        let str = ''

        for (const cond of this.event.condition) {
            str += `<div class="list-item">${cond.replace(/ /g, '&nbsp;')}</div>`
        }

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

    private renderLocals(ndx: number) {
        let str = `<div class="locals-title">Locals:</div>`

        const locals = this.frameLocals[ndx] ?? []

        for (const local of locals) {
            str += `<div class="locals-var">${local.name} = ${local.value}</div>`
        }

        return str
    }

    private isRestartable(bt: Frame): boolean {
        const opts = bt.opts ?? []

        for (const opt of opts) {
            if (opt.name.toUpperCase() === ':RESTARTABLE' && opt.value) {
                return true
            }
        }

        return false
    }

    private renderRestartBtn(ndx: number) {
        return `<button class="debug-btn restart-btn" onclick="frame_restart(${ndx})")>
                    R
                </button>`
    }

    private renderEvalInFrame(ndx: number) {
        let str = ''

        str += `<div class="eval-box">
                    <div class="eval-row">
                        <div class="eval-label">
                            <button class="debug-btn eval-btn" onclick="frame_eval(${ndx})">
                                Eval
                            </button>
                        </div>
                        <div class="eval-input-box">
                            <form onsubmit="frame_eval(${ndx})">
                                <input id="eval-input-${ndx}" type="text" class="eval-input"
                                    onchange="input_changed(${ndx})"
                                    value="${this.frameInput[ndx] ?? ''}"
                                >
                            </form>
                        </div>
                    </div>
                    <div class="eval-row">
                        <div class="eval-label"></div>
                        <div class="eval-result-box">
                            <input type="text" readonly class="eval-result" value="${this.frameEval[ndx] ?? ''}">
                        </div>
                    </div>
                </div>`

        return str
    }

    private renderExpanded(ndx: number) {
        if (!this.frameExpanded[ndx]) {
            return ''
        }

        let str = `<div class="locals-box">
                       ${this.renderLocals(ndx)}
                       ${this.renderEvalInFrame(ndx)}
                   </div>`

        return str
    }

    private renderBtTable(bt: Frame) {
        let str = ''

        str += `<table class="frame-table list-item">
                  <tbody>
                    <tr>
                        <td class="frame-btn-cell">${this.isRestartable(bt) ? this.renderRestartBtn(bt.num) : ''}</td>
                        <td class="frame-num-cell">${bt.num}:</td>
                        <td class="frame-data-cell">
                            <div class="clickable" onclick="bt_locals(${bt.num})">
                                ${bt.desc}
                            </div>
                            ${this.renderExpanded(bt.num)}
                        </td>
                    </tr>
                  </tbody>
                </table>`
        return str
    }

    private renderBtList() {
        let str = ''

        for (const bt of this.event.frames) {
            str += this.renderBtTable(bt)
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

    private renderRestartItem(ndx: number, name: string, desc: string) {
        return `
            <div class="list-item clickable" onclick="restart(${ndx})">
                ${ndx}: [${name}] ${desc}
            </div>
        `
    }

    private renderRestartList() {
        let str = ''
        let ndx = 0

        for (const restart of this.event.restarts) {
            str += this.renderRestartItem(ndx, restart.name, restart.desc)
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
