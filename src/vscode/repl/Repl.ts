import { EventEmitter } from 'events'
import { format } from 'util'
import * as vscode from 'vscode'
import { Expr, InPackage, Lexer, Parser, unescape } from '../../lisp'
import { allLabels } from '../../lisp/keywords'
import { Debug, DebugActivate, DebugReturn } from '../../swank/event'
import * as response from '../../swank/response'
import { SwankConn } from '../../swank/SwankConn'
import { convert } from '../../swank/SwankUtils'
import { ConnInfo, Restart } from '../../swank/Types'
import { isReplDoc } from '../Utils'
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
                await this.view.show()
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

            if (resp instanceof response.ConnectionInfo) {
                this.handleConnInfo(resp.info)
            }

            await this.getKwDocs()
        } catch (err) {
            this.displayErrMsg(err)
        }
    }

    async disconnect() {
        if (this.conn === undefined) {
            return
        }

        this.conn.close()
        this.conn = undefined

        this.view?.close()
    }

    setIgnoreDebug(ignore: boolean) {
        this.conn?.setIgnoreDebug(ignore)
    }

    documentChanged() {
        this.view?.documentChanged()
    }

    async findDefs(label: string, pkg: string) {
        return await this.conn?.findDefs(label, pkg)
    }

    async loadFile(path: string) {
        await this.view?.addText(`;; Loading ${path}`)
        await this.conn?.loadFile(path)
        await this.view?.addTextAndPrompt(`;; Done loading ${path}`)
    }

    async abort() {
        const threadIDs = this.getVisibleDebugThreads()
        if (this.conn === undefined || threadIDs.length === 0) {
            vscode.window.showInformationMessage('No debug to abort')
            return
        }

        for (const id of threadIDs) {
            await this.conn.debugAbort(id)
        }
    }

    async nthRestart(n: number) {
        const threadIDs = this.getVisibleDebugThreads()
        if (this.conn === undefined || threadIDs.length === 0) {
            vscode.window.showInformationMessage('No debug to restart')
            return
        }

        const id = threadIDs[0]
        if (this.dbgViews[id] !== undefined) {
            this.dbgViews[id].stop()
            delete this.dbgViews[id]
        }

        await this.conn.nthRestart(id, n)
    }

    async updateConnInfo() {
        if (this.conn === undefined) {
            return
        }

        const resp = await this.conn.connectionInfo()
        if (resp instanceof response.ConnectionInfo) {
            this.handleConnInfo(resp.info)
        }
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

    async getDoc(symbol: string, pkg: string): Promise<string> {
        if (this.conn === undefined) {
            return ''
        }

        try {
            if (symbol in this.kwDocs) {
                return this.kwDocs[symbol]
            }

            const resp = await this.conn.docSymbol(symbol, pkg)
            return resp instanceof response.DocSymbol ? resp.doc : ''
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
            return resp instanceof response.ListPackages ? resp.names : []
        } catch (err) {
            return []
        }
    }

    async getCompletions(prefix: string, pkg: string): Promise<string[]> {
        if (this.conn === undefined) {
            return []
        }

        try {
            const resp = await this.conn.completions(prefix, pkg)
            return resp instanceof response.Completions ? resp.strings : []
        } catch (err) {
            return []
        }
    }

    async getOpArgs(name: string, pkg: string): Promise<string> {
        if (this.conn === undefined) {
            return ''
        }

        try {
            const resp = await this.conn.opArgsList(name, pkg)
            return resp instanceof response.OpArgs ? resp.desc : ''
        } catch (err) {
            return ''
        }
    }

    async changePackage(expr: InPackage, output: boolean = true) {
        const pkgName = expr.name
        const pkg = await this.conn?.setPackage(pkgName)

        if (pkg instanceof response.SetPackage) {
            this.updatePackage(pkg.name)
        }

        if (output) {
            const infoResp = await this.conn?.connectionInfo(pkgName)

            if (infoResp instanceof response.ConnectionInfo) {
                this.handleConnInfo(infoResp.info)
            }
        }
    }

    async disassemble(text: string, pkg?: string): Promise<string | undefined> {
        if (this.conn === undefined) {
            return undefined
        }

        const resp = await this.conn.disassemble(text, pkg)

        if (resp instanceof response.Eval) {
            const converted = resp.result.map((i) => convert(i))
            return unescape(converted.join(''))
        }

        return undefined
    }

    async macroExpand(text: string, pkg?: string): Promise<string | undefined> {
        if (this.conn === undefined) {
            return undefined
        }

        const resp = await this.conn.macroExpand(text, pkg)

        if (resp instanceof response.Eval) {
            const converted = resp.result.map((i) => convert(i))
            return unescape(converted.join(''))
        }

        return undefined
    }

    async macroExpandAll(text: string, pkg?: string): Promise<string | undefined> {
        if (this.conn === undefined) {
            return undefined
        }

        const resp = await this.conn.macroExpandAll(text, pkg)

        if (resp instanceof response.Eval) {
            const converted = resp.result.map((i) => convert(i))
            return unescape(converted.join(''))
        }

        return undefined
    }

    async eval(text: string, pkg?: string): Promise<string | undefined> {
        if (this.conn === undefined) {
            return undefined
        }

        const resp = await this.conn.evalAndGrab(text, pkg)

        if (resp instanceof response.EvalAndGrab) {
            const converted = resp.result.map((i) => convert(i))
            return unescape(converted.join(''))
        }

        return undefined
    }

    async inlineEval(text: string, pkg?: string): Promise<string | undefined> {
        if (this.conn === undefined) {
            return undefined
        }

        const resp = await this.conn.eval(text, pkg)

        if (resp instanceof response.Eval) {
            const converted = resp.result.map((i) => convert(i))
            return unescape(converted.join(''))
        }

        return undefined
    }

    async send(editor: vscode.TextEditor, text: string, pkg: string, output: boolean = true) {
        if (this.conn === undefined || this.view === undefined) {
            return
        }

        try {
            const expr = this.parseEvalText(text)
            const inPkg = expr !== undefined ? InPackage.from(expr) : undefined

            if (output) {
                await this.view.addText(text)
            }

            if (isReplDoc(editor.document) && inPkg !== undefined) {
                await this.changePackage(inPkg, output)
            } else {
                const resp = await this.conn.eval(text, pkg)

                if (output) {
                    if (resp instanceof response.Eval) {
                        const str = unescape(resp.result.join(''))
                        await this.view.addTextAndPrompt(str)
                    } else {
                        await this.view.addTextAndPrompt('')
                    }

                    vscode.window.showTextDocument(editor.document, editor.viewColumn)
                }
            }

            editor.document.save()
        } catch (err) {
            vscode.window.showErrorMessage(format(err))
        }
    }

    private getVisibleDebugThreads(): number[] {
        const threadIDs: number[] = []

        for (const [key, value] of Object.entries(this.dbgViews)) {
            if (!value.panel?.visible) {
                continue
            }

            const threadID = parseInt(key)

            if (!Number.isNaN(threadID)) {
                threadIDs.push(threadID)
            }
        }

        return threadIDs
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

        view.on('restart', (ndx: number, event: Restart) => this.nthRestart(ndx))

        view.on('frame-restart', async (ndx: number) => this.conn?.frameRestart(event.threadID, ndx))

        view.on('frame-eval', async (ndx: number, text: string) => {
            const result = await this.evalInFrame(ndx, text, event.threadID)

            if (result !== undefined) {
                await this.updateLocals(view, ndx, event.threadID)
                view.setEvalResponse(ndx, result)
            }
        })

        view.on('frame-locals', async (ndx: number) => this.updateLocals(view, ndx, event.threadID))

        this.dbgViews[event.threadID] = view
    }

    private async updateLocals(view: DebugView, ndx: number, threadID: number) {
        const resp = await this.retrieveFrameLocals(ndx, threadID)

        if (resp !== undefined) {
            view.setLocals(ndx, resp.locals)
        }
    }

    private async evalInFrame(ndx: number, text: string, threadID: number) {
        const pkg = await this.conn?.framePackage(threadID, ndx)

        if (pkg === undefined || this.conn === undefined || this.view === undefined) {
            return
        }

        const resp = await this.conn.evalInFrame(threadID, text, ndx, pkg.name)

        if (resp instanceof response.Eval) {
            return unescape(resp.result.join(''))
        }
    }

    private async retrieveFrameLocals(ndx: number, threadID: number) {
        return await this.conn?.frameLocals(threadID, ndx)
    }

    private async handleDebugReturn(event: DebugReturn) {
        const dbgView = this.dbgViews[event.threadID]

        if (dbgView === undefined) {
            return
        }

        dbgView.stop()
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

            if (resp instanceof response.DocSymbol) {
                this.kwDocs[label] = resp.doc
            }
        }
    }

    private onClose() {
        this.view?.close()

        this.conn = undefined
        this.view = undefined

        this.emit('close')
    }

    private async handleConnInfo(info: ConnInfo) {
        if (this.view === undefined) {
            return
        }

        if (info.package?.prompt === undefined) {
            return
        }

        this.curPackage = info.package.name

        try {
            await this.view.show()
            this.view.setPrompt(info.package.prompt)
        } catch (err) {
            vscode.window.showErrorMessage(format(err))
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
