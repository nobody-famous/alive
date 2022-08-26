import * as path from 'path'
import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { InspectInfo } from '../Types'
import { strToHtml } from '../Utils'

// import { unescape } from '../../lisp'
// import { InspectContent, InspectContentAction } from '../../swank/Types'

export class Inspector extends EventEmitter {
    ctx: vscode.ExtensionContext
    viewCol: vscode.ViewColumn
    info: InspectInfo
    panel?: vscode.WebviewPanel

    title?: string

    constructor(ctx: vscode.ExtensionContext, viewCol: vscode.ViewColumn, result: InspectInfo) {
        super()

        this.ctx = ctx
        this.viewCol = viewCol
        this.info = result
    }

    show() {
        this.title = this.info.text

        if (this.panel !== undefined) {
            this.stop()
        }

        this.initPanel(this.title)
        this.renderHtml()
    }

    stop() {
        this.panel?.dispose()
        this.panel = undefined
        vscode.commands.executeCommand('setContext', 'clInspectorActive', false)
    }

    private initPanel(title: string) {
        this.panel = vscode.window.createWebviewPanel('cl-inspector', title, this.viewCol, { enableScripts: true })

        this.panel.webview.onDidReceiveMessage((msg: { command: string; [index: string]: unknown }) => {
            switch (msg.command.toUpperCase()) {
                case 'VALUE':
                    return this.emit('inspect-part', msg.index)
                case 'ACTION':
                    return this.emit('inspector-action', msg.index)
                case 'EVAL':
                    return this.emit('inspector-eval', msg.text)
            }
        })

        this.panel.onDidDispose(() => {
            this.emit('inspectorClosed')
        })

        vscode.commands.executeCommand('setContext', 'clInspectorActive', this.panel?.active)
    }

    // private renderAction(item: InspectContentAction) {
    private renderAction() {
        // const display = this.escapeHtml(unescape(item.display))
        // const actName = item.action.toUpperCase()
        // let btnClass = ''
        // let btnClick = ''
        // let str = ''
        // if (actName === 'ACTION') {
        //     btnClass = 'inspect-btn-action'
        //     btnClick = `inspect_action(${item.index})`
        // } else if (actName === 'VALUE') {
        //     btnClass = 'inspect-btn-value'
        //     btnClick = `inspect_value(${item.index})`
        // }
        // str += `
        //     <div class="inspect-action-box">
        //         <button class="${btnClass}" onclick="${btnClick}">${display}</button>
        //     </div>
        // `
        // return str
    }

    private renderArray(arr: Array<unknown>) {
        const entries = arr.map((value, index) => {
            const strValue = strToHtml(typeof value === 'string' ? value : JSON.stringify(value))

            return `
                <div class="inspector-array-index">${index}:</div>
                <div>${strValue}</div>
            `
        })

        return `
            <div class="inspector-content">
                ${entries.join('')}
            </div>
        `
    }

    private renderObject(value: object | null) {
        if (value === null) {
            return 'NULL'
        }

        const valueObj = value as { [index: string]: unknown }
        const entries = Object.keys(valueObj).map((key) => {
            const v = valueObj[key]
            const valueStr = typeof v === 'string' ? v : JSON.stringify(v)

            return `
                <div>${strToHtml(key)}</div>
                <div>${strToHtml(valueStr)}</div>
            `
        })

        return `
            <div class="inspector-content">
                ${entries.join('')}
            </div>
        `
    }

    private renderValue(value: unknown) {
        if (Array.isArray(value)) {
            return this.renderArray(value)
        } else if (typeof value === 'object') {
            return this.renderObject(value)
        } else {
            const valueStr = typeof value === 'string' ? value : JSON.stringify(value)
            return `<div>${strToHtml(valueStr)}</div>`
        }
    }

    private renderRow(key: string, value: unknown) {
        return `
            <div class="inspector-row-key">${key}</div>
            <div class="inspector-row-value">${value}</div>
        `
    }

    private renderFields() {
        if (typeof this.info.result !== 'object') {
            return
        }

        const resultObj = this.info.result as { [index: string]: unknown }

        if (resultObj.value === undefined) {
            return
        }

        const divs = Object.keys(resultObj).map((key) => {
            if (key === 'value') {
                return ''
            }

            const entry = resultObj[key]
            const str = typeof entry === 'string' ? strToHtml(entry) : JSON.stringify(entry)

            return this.renderRow(key, str)
        })

        divs.push(this.renderRow('value', this.renderValue(resultObj['value'])))

        return divs.join('')
    }

    private renderContent() {
        return this.renderFields()

        // if (this.content === undefined) {
        //     return ''
        // }
        // const display = this.content.display
        // let str = ''
        // let opened = false
        // for (const item of display) {
        //     if (typeof item === 'string') {
        //         if (opened) {
        //             str += '</div>'
        //             opened = false
        //         }
        //         opened = true
        //         str += `<div class="inspect-item">`
        //         str += item
        //     } else if ('display' in item) {
        //         str += this.renderAction(item)
        //     }
        // }
        // return str
    }

    private renderHtml() {
        // if (this.panel === undefined || this.title === undefined || this.content === undefined) {
        if (this.panel === undefined || this.title === undefined) {
            vscode.window.showInformationMessage('Inspector not initialized')
            return
        }

        const jsPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'inspector', 'inspect.js'))
        const cssPath = vscode.Uri.file(path.join(this.ctx.extensionPath, 'resource', 'inspector', 'inspect.css'))

        this.panel.webview.html = `
            <html>
            <head>
                <link rel="stylesheet" href="${this.panel?.webview.asWebviewUri(cssPath)}">
            </head>
            <body>
                <div id="content">
                    <div class="inspect-title">${strToHtml(this.info.package)}:${strToHtml(this.info.text)}</div>
                    <hr></hr>
                    <div class="inspector-content">
                        <div class="inspector-data">
                            ${this.renderContent()}
                        </div>
                        <div class="inspector-eval">
                            <form id="eval-form" action="">
                                <input class="inspector-eval-text" id="eval-text" type="text">
                            </form>
                        </div>
                    </div>
                </div>

                <script src="${this.panel?.webview.asWebviewUri(jsPath)}"></script>
            </body>
            </html>
        `
    }
}
