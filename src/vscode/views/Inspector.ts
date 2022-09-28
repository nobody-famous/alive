import * as path from 'path'
import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { InspectInfo, InspectResult } from '../Types'
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

    update(data: InspectResult) {
        this.info.result = data.result
        this.renderHtml()
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
                case 'REFRESH':
                    return this.emit('inspector-refresh')
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
                <div class="inspector-object-row">
                    <div class="inspector-object-key">${strToHtml(index.toString())}:</div>
                    <div class="inspector-object-value">${strValue}</div>
                </div>
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
                <div class="inspector-object-row">
                    <div class="inspector-object-key">${strToHtml(key)}</div>
                    <div class="inspector-object-value">${strToHtml(valueStr)}</div>
                </div>
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
                    <div class="inspector-title">
                        <div id="refresh-btn" class="inspector-refresh">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path fill-rule="evenodd" clip-rule="evenodd" d="M5.56277 2.51577C3.46372 3.4501 2.00024 5.55414 2.00024 7.99999C2.00024 11.3137 4.68654 14 8.00024 14C11.314 14 14.0002 11.3137 14.0002 7.99999C14.0002 5.32519 12.25 3.05919 9.83224 2.28482L9.52992 3.23832C11.5431 3.88454 13.0002 5.7721 13.0002 7.99999C13.0002 10.7614 10.7617 13 8.00024 13C5.23882 13 3.00024 10.7614 3.00024 7.99999C3.00024 6.31104 3.83766 4.81767 5.11994 3.91245L5.56277 2.51577Z" fill="currentColor"/>
                                <path fill-rule="evenodd" clip-rule="evenodd" d="M5.00024 3H2.00024V2H5.50024L6.00024 2.5V6H5.00024V3Z" fill="currentColor"/>
                            </svg>
                        </div>
                    
                        ${strToHtml(this.info.package)}:${strToHtml(this.info.text)}
                    </div>
                    <hr></hr>
                    <div class="inspector-content">
                        <div class="inspector-data">
                            ${this.renderContent()}
                        </div>
                    </div>
                    <div class="inspector-eval">
                        <form id="eval-form" action="">
                            <input class="inspector-eval-text"
                                   id="eval-text"
                                   type="text"
                                   placeholder="Use * to refer to the current value"
                            >
                        </form>
                    </div>
                </div>

                <script src="${this.panel?.webview.asWebviewUri(jsPath)}"></script>
            </body>
            </html>
        `
    }
}
