import { EventEmitter } from 'events'
import * as path from 'path'
import * as vscode from 'vscode'
import { isPosition } from '../Guards'
import { DebugInfo, RestartInfo } from '../Types'
import { strToHtml } from '../Utils'
// import * as event from '../../swank/event'
// import { Frame, FrameVariable } from '../../swank/Types'

interface jsMessage {
    command: string
    [index: string]: unknown
}

export class DebugView extends EventEmitter {
    ctx: vscode.ExtensionContext
    title: string
    panel?: vscode.WebviewPanel
    info: DebugInfo
    // event: event.Debug
    // activate?: event.DebugActivate
    frameExpanded: { [index: number]: boolean | undefined } = {}
    // frameLocals: { [index: number]: FrameVariable[] | undefined } = {}
    frameEval: { [index: number]: string | undefined } = {}
    frameInput: { [index: number]: string | undefined } = {}
    viewCol: vscode.ViewColumn

    // constructor(ctx: vscode.ExtensionContext, title: string, viewCol: vscode.ViewColumn, event: event.Debug) {
    constructor(ctx: vscode.ExtensionContext, title: string, viewCol: vscode.ViewColumn, info: DebugInfo) {
        super()

        this.ctx = ctx
        this.title = title
        this.viewCol = viewCol
        this.info = info
        // this.event = event
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

        this.panel.onDidChangeViewState(() => {
            vscode.commands.executeCommand('setContext', 'clDebugViewActive', this.panel?.active)
        })

        this.renderHtml()
    }

    stop() {
        this.panel?.dispose()
        this.panel = undefined
    }

    // setLocals(ndx: number, locals: FrameVariable[]) {
    //     this.frameLocals[ndx] = locals
    //     this.renderHtml()
    // }

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
        // this.emit('inspect-cond', this.event.threadID)
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

        // if (this.frameLocals[num] === undefined) {
        //     this.emit('frame-locals', num)
        // }

        this.renderHtml()
    }

    private restartCommand(msg: jsMessage) {
        // const restart = this.event.restarts[num]
        // this.emit('restart', num, restart)

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

    private renderLocals(ndx: number) {
        let str = `<div class="locals-title">Locals:</div>`

        // const locals = this.frameLocals[ndx] ?? []

        // for (const local of locals) {
        //     str += `<div class="locals-var">${local.name} = ${local.value}</div>`
        // }

        return str
    }

    // private isRestartable(bt: Frame): boolean {
    //     const opts = bt.opts ?? []

    //     for (const opt of opts) {
    //         if (opt.name.toUpperCase() === ':RESTARTABLE' && opt.value) {
    //             return true
    //         }
    //     }

    //     return false
    // }

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

    // private renderBtTable(bt: Frame) {
    //     let str = ''

    //     str += `<table class="frame-table list-item">
    //               <tbody>
    //                 <tr>
    //                     <td class="frame-btn-cell">${this.isRestartable(bt) ? this.renderRestartBtn(bt.num) : ''}</td>
    //                     <td class="frame-num-cell">${bt.num}:</td>
    //                     <td class="frame-data-cell">
    //                         <div class="clickable" onclick="bt_locals(${bt.num})">
    //                             ${bt.desc}
    //                         </div>
    //                         ${this.renderExpanded(bt.num)}
    //                     </td>
    //                 </tr>
    //               </tbody>
    //             </table>`
    //     return str
    // }

    private renderBtList() {
        let str = ''
        let ndx = this.info.stackTrace.length

        const posStr = (file: string | null, pos: vscode.Position | null) => {
            if (file === null || pos === null) {
                return ''
            }

            const fileStr = strToHtml(file)
            const lineStr = `${pos.line + 1}`
            const charStr = `${pos.character + 1}`

            return `${fileStr}:${lineStr}:${charStr}`
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

        // for (const bt of this.event.frames) {
        //     str += this.renderBtTable(bt)
        // }

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
