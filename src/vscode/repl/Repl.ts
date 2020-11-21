import { EventEmitter } from 'events'
import { format } from 'util'
import * as vscode from 'vscode'
import { Expr, InPackage, Lexer, Parser, unescape } from '../../lisp'
import { allLabels } from '../../lisp/keywords'
import { Debug, DebugActivate, DebugReturn } from '../../swank/event'
import { SwankConn } from '../../swank/SwankConn'
import { convert } from '../../swank/SwankUtils'
import { ConnInfo, Restart } from '../../swank/Types'
import { DebugView } from './DebugView'
import { FileView } from './FileView'
import { View } from './View'

export class Repl extends EventEmitter {
    conn?: SwankConn
    view?: View
    dbgViews: { [index: number]: DebugView } = {}
    curPackage: string = ':cl-user'
    ctx: vscode.ExtensionContext
    host: string
    port: number
    kwDocs: { [index: string]: string } = {}

    constructor(ctx: vscode.ExtensionContext, host: string, port: number) {
        super()

        this.ctx = ctx
        this.host = host
        this.port = port
    }

    async connect() {
        try {
            if (this.conn !== undefined && this.view !== undefined) {
                this.view.show()
                return
            }

            this.conn = new SwankConn(this.host, this.port)
            this.view = new FileView(this.host, this.port)

            this.conn.on('conn-info', (info) => this.handleConnInfo(info))
            this.conn.on('conn-err', (err) => this.displayErrMsg(err))
            this.conn.on('msg', (msg) => this.displayInfoMsg(msg))
            this.conn.on('activate', (event) => this.handleDebugActivate(event))
            this.conn.on('debug', (event) => this.handleDebug(event))
            this.conn.on('debug-return', (event) => this.handleDebugReturn(event))
            this.conn.on('close', () => this.onClose())

            await this.conn.connect()
            await this.view.open()
            await this.view.show()

            const resp = await this.conn.connectionInfo()
            this.handleConnInfo(resp.info)

            await this.getKwDocs()
        } catch (err) {
            this.displayErrMsg(err)
        }
    }

    documentChanged() {
        this.view?.documentChanged()
    }

    async abort() {
        if (this.conn === undefined) {
            return
        }

        for (const [key, value] of Object.entries(this.dbgViews)) {
            if (value.panel?.active) {
                const threadID = parseInt(key)

                if (!Number.isNaN(threadID)) {
                    this.conn.debugAbort(threadID)
                }
            }
        }
    }

    async updateConnInfo() {
        if (this.conn === undefined) {
            return
        }

        const resp = await this.conn.connectionInfo()
        this.handleConnInfo(resp.info)
    }

    async compileFile(fileName: string) {
        if (this.conn === undefined) {
            return
        }

        try {
            const resp = await this.conn.compileFile(fileName)
            vscode.window.showInformationMessage(format(resp))
        } catch (err) {
            vscode.window.showErrorMessage(err)
        }
    }

    async getDoc(symbol: string): Promise<string> {
        if (this.conn === undefined) {
            return ''
        }

        try {
            if (symbol in this.kwDocs) {
                return this.kwDocs[symbol]
            }

            const resp = await this.conn.docSymbol(symbol, ':cl-user')
            return resp.doc
        } catch (err) {
            return ''
        }
    }

    async getPackageNames(): Promise<string[]> {
        if (this.conn === undefined) {
            return []
        }

        try {
            const resp = await this.conn.listPackages()
            return resp.names
        } catch (err) {
            return []
        }
    }

    async getCompletions(prefix: string): Promise<string[]> {
        if (this.conn === undefined) {
            return []
        }

        try {
            const resp = await this.conn.completions(prefix, this.curPackage)
            return resp.strings
        } catch (err) {
            return []
        }
    }

    async getOpArgs(name: string): Promise<string> {
        if (this.conn === undefined) {
            return ''
        }

        try {
            const resp = await this.conn.opArgsList(name, this.curPackage)
            return resp.desc
        } catch (err) {
            return ''
        }
    }

    async changePackage(expr: InPackage, output: boolean = true) {
        const pkgName = expr.name.startsWith(':') ? expr.name : `:${expr.name}`
        const pkg = await this.conn?.setPackage(pkgName)

        this.updatePackage(pkg?.name)

        if (output) {
            const infoResp = await this.conn?.connectionInfo(pkgName)

            if (infoResp !== undefined) {
                this.handleConnInfo(infoResp.info)
            }
        }
    }

    async send(text: string, pkg: string, output: boolean = true) {
        if (this.conn === undefined || this.view === undefined) {
            return
        }

        try {
            await this.view.show()

            const expr = this.parseEvalText(text)
            const inPkg = expr !== undefined ? InPackage.from(expr) : undefined

            if (inPkg !== undefined) {
                await this.changePackage(inPkg, output)
            } else {
                const resp = await this.conn.eval(text, pkg)

                if (output) {
                    const str = unescape(resp.result.join(''))
                    this.view.addText(str)
                }
            }
        } catch (err) {
            vscode.window.showErrorMessage(err)
        }
    }

    private handleDebugActivate(event: DebugActivate) {
        const view = this.dbgViews[event.threadID]

        if (view === undefined) {
            vscode.window.showInformationMessage(`Debug could not activate ${event.threadID}`)
            return
        }

        view.run()
    }

    private handleDebug(event: Debug) {
        const view = new DebugView(
            this.ctx,
            `Debug TH-${event.threadID}`,
            this.view?.getViewColumn() ?? vscode.ViewColumn.Beside,
            event
        )

        view.on('restart', (ndx: number, event: Restart) => this.abort())

        this.dbgViews[event.threadID] = view
    }

    private async handleDebugReturn(event: DebugReturn) {
        const dbgView = this.dbgViews[event.threadID]

        if (dbgView === undefined) {
            vscode.window.showErrorMessage(`Debug Return for ${event.threadID} has no view`)
            return
        }

        dbgView.stop()
        this.view?.show()

        delete this.dbgViews[event.threadID]
    }

    private displayErrMsg(msg: unknown) {
        vscode.window.showErrorMessage(format(msg))
    }

    private displayInfoMsg(msg: unknown) {
        vscode.window.showInformationMessage(format(msg))
    }

    private async getKwDocs() {
        if (this.conn === undefined) {
            return
        }

        for (const label of allLabels) {
            const resp = await this.conn.docSymbol(label, ':cl-user')

            this.kwDocs[label] = resp.doc
        }
    }

    private onClose() {
        this.view?.close()

        this.conn = undefined
        this.view = undefined

        this.emit('close')
    }

    private handleConnInfo(info: ConnInfo) {
        if (this.view === undefined) {
            return
        }

        if (info.package?.prompt !== undefined) {
            this.curPackage = info.package.name
            this.view.setPrompt(info.package.prompt)
            this.view.show()
        }
    }

    private parseEvalText(text: string): Expr | undefined {
        const lex = new Lexer(text)
        const parser = new Parser(lex.getTokens())
        const exprs = parser.parse()

        return exprs.length > 0 ? exprs[0] : undefined
    }

    private updatePackage(name: string | undefined) {
        if (name === undefined) {
            return
        }

        const newPkg = convert(name)

        if (newPkg !== undefined && typeof newPkg === 'string') {
            this.curPackage = newPkg
        }
    }
}
