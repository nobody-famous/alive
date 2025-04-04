import { EventEmitter } from 'events'
import * as path from 'path'
import * as vscode from 'vscode'
import { InspectInfo, InspectResult } from '../Types'
import { strToHtml } from '../Utils'
import { isFiniteNumber, isObject, isString } from '../Guards'

interface InspectorEvents {
    inspectorClosed: []
    inspectPart: [number]
    inspectorAction: [number]
    inspectorEval: [string]
    inspectorMacroInc: []
    inspectorRefreshMacro: []
    inspectorRefresh: []
}

export interface Message {
    command: string
    [index: string]: unknown
}

export class Inspector extends EventEmitter<InspectorEvents> {
    extensionPath: string
    viewCol: vscode.ViewColumn
    info: InspectInfo
    panel?: vscode.WebviewPanel

    constructor(path: string, viewCol: vscode.ViewColumn, result: InspectInfo) {
        super()

        this.extensionPath = path
        this.viewCol = viewCol
        this.info = result
    }

    show() {
        if (this.panel !== undefined) {
            this.stop()
        }

        this.panel = this.initPanel(this.info.text)
        this.renderHtml(this.panel)
    }

    stop() {
        this.panel?.dispose()
        this.panel = undefined
        vscode.commands.executeCommand('setContext', 'clInspectorActive', false)
    }

    update(data: InspectResult) {
        this.info.result = data.result

        if (this.panel !== undefined) {
            this.renderHtml(this.panel)
        }
    }

    private initPanel(title: string) {
        const panel = vscode.window.createWebviewPanel('cl-inspector', title, this.viewCol, { enableScripts: true })

        panel.webview.onDidReceiveMessage((msg: Message) => {
            switch (msg.command.toUpperCase()) {
                case 'VALUE':
                    return this.inspectPart(msg)
                case 'ACTION':
                    return this.inspectorAction(msg)
                case 'EVAL':
                    return this.inspectorEval(msg)
                case 'EXPINC':
                    return this.emit('inspectorMacroInc')
                case 'REFRESH':
                    return this.info.resultType === 'macro' ? this.emit('inspectorRefreshMacro') : this.emit('inspectorRefresh')
            }
        })

        panel.onDidDispose(() => {
            this.emit('inspectorClosed')
        })

        vscode.commands.executeCommand('setContext', 'clInspectorActive', panel.active)

        return panel
    }

    private inspectPart(msg: Message) {
        if (isFiniteNumber(msg.index)) {
            this.emit('inspectPart', msg.index)
        }
    }

    private inspectorAction(msg: Message) {
        if (isFiniteNumber(msg.index)) {
            this.emit('inspectorAction', msg.index)
        }
    }

    private inspectorEval(msg: Message) {
        if (isString(msg.text)) {
            this.emit('inspectorEval', msg.text)
        }
    }

    private renderArray(arr: Array<unknown>) {
        const entries = arr.map((value, index) => {
            const strValue = strToHtml(isString(value) ? value : JSON.stringify(value))

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
            const valueStr = isString(v) ? v : JSON.stringify(v)

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
            const valueStr = isString(value) ? value : JSON.stringify(value)
            return `<div>${strToHtml(valueStr)}</div>`
        }
    }

    private renderRow(key: string, value: unknown) {
        return `
            <div class="inspector-row-key">${key}</div>
            <div class="inspector-row-value">${value}</div>
        `
    }

    private renderFields(result: unknown) {
        if (!isObject(result) || result.value === undefined) {
            return
        }

        const divs = Object.keys(result).map((key) => {
            if (key === 'value') {
                return ''
            }

            const entry = result[key]
            const str = isString(entry) ? strToHtml(entry) : JSON.stringify(entry)

            return this.renderRow(key, str)
        })

        divs.push(this.renderRow('value', this.renderValue(result['value'])))

        return divs.join('')
    }

    private renderContent() {
        return this.renderFields(this.info.result)
    }

    private renderExprHtml(panel: vscode.WebviewPanel, jsPath: vscode.Uri, cssPath: vscode.Uri) {
        return `
        <html>
        <head>
            <link rel="stylesheet" href="${panel.webview.asWebviewUri(cssPath)}">
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

            <script src="${panel.webview.asWebviewUri(jsPath)}"></script>
        </body>
        </html>
    `
    }

    private renderMacroHtml(panel: vscode.WebviewPanel, jsPath: vscode.Uri, cssPath: vscode.Uri) {
        const data = isString(this.info.result) ? this.info.result : ''

        return `
        <html>
        <head>
            <link rel="stylesheet" href="${panel.webview.asWebviewUri(cssPath)}">
        </head>
        <body>
            <div id="content">
                <div class="inspector-title">
                    ${strToHtml(this.info.package)}
                </div>
                <hr></hr>
                <div class="inspector-content">
                    <div class="inspector-data inspector-macro-text">
                        ${strToHtml(this.info.text)}
                    </div>
                    <div class="inspector-btn-box">
                        <div id="refresh-btn" class="inspector-refresh">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path fill-rule="evenodd" clip-rule="evenodd" d="M5.56277 2.51577C3.46372 3.4501 2.00024 5.55414 2.00024 7.99999C2.00024 11.3137 4.68654 14 8.00024 14C11.314 14 14.0002 11.3137 14.0002 7.99999C14.0002 5.32519 12.25 3.05919 9.83224 2.28482L9.52992 3.23832C11.5431 3.88454 13.0002 5.7721 13.0002 7.99999C13.0002 10.7614 10.7617 13 8.00024 13C5.23882 13 3.00024 10.7614 3.00024 7.99999C3.00024 6.31104 3.83766 4.81767 5.11994 3.91245L5.56277 2.51577Z" fill="currentColor"/>
                                <path fill-rule="evenodd" clip-rule="evenodd" d="M5.00024 3H2.00024V2H5.50024L6.00024 2.5V6H5.00024V3Z" fill="currentColor"/>
                            </svg>
                        </div>
                        <div id="expand-inc-btn" class="inspector-refresh">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14.0001 7V8H8.00012V14H7.00012V8H1.00012V7H7.00012V1H8.00012V7H14.0001Z" fill="currentColor"/>
                            </svg>
                        </div>
                    </div>
                    <div class="inspector-content">
                        <div class="inspector-macro-data">
                            ${strToHtml(data)}
                        </div>
                    </div>
                </div>
            </div>

            <script src="${panel.webview.asWebviewUri(jsPath)}"></script>
        </body>
        </html>
    `
    }

    private renderHtml(panel: vscode.WebviewPanel) {
        const jsPath = vscode.Uri.file(path.join(this.extensionPath, 'resources', 'inspector', 'inspect.js'))
        const cssPath = vscode.Uri.file(path.join(this.extensionPath, 'resources', 'inspector', 'inspect.css'))

        panel.webview.html =
            this.info.resultType === 'macro'
                ? this.renderMacroHtml(panel, jsPath, cssPath)
                : this.renderExprHtml(panel, jsPath, cssPath)
    }
}
