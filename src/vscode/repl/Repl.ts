import { EventEmitter } from 'events'
import { EOL } from 'os'
import { format } from 'util'
import * as vscode from 'vscode'
import { Expr, InPackage, isString, Lexer, Parser, unescape } from '../../lisp'
import { Debug, DebugActivate, DebugReturn, ReadString, WriteString } from '../../swank/event'
import * as response from '../../swank/response'
import { SwankConn } from '../../swank/SwankConn'
import { convert } from '../../swank/SwankUtils'
import { ConnInfo, Restart } from '../../swank/Types'
import { isReplDoc, xlatePath } from '../Utils'
import { DebugView } from './DebugView'
import { FileView } from './FileView'
import { History, HistoryItem } from './History'
import { Inspector } from './Inspector'
import { View } from './View'

export class Repl extends EventEmitter {
    conn?: SwankConn
    view?: View
    inspectorView?: Inspector
    dbgView?: DebugView
    curPackage: string = ':cl-user'
    ctx: vscode.ExtensionContext
    kwDocs: { [index: string]: string } = {}
    history: History = new History()

    constructor(ctx: vscode.ExtensionContext) {
        super()

        this.ctx = ctx
    }

    async connect(host: string, port: number) {
        try {
            if (this.conn !== undefined && this.view !== undefined) {
                await this.view.show()
                return
            }

            this.conn = new SwankConn(host, port)
            this.view = new FileView(host, port)

            const cfg = vscode.workspace.getConfiguration('alive')
            if (cfg.debug) {
                this.conn.trace = true
            }

            this.conn.on('conn-info', (info) => this.handleConnInfo(info))
            this.conn.on('conn-err', (err) => this.displayErrMsg(err))
            this.conn.on('msg', (msg) => this.displayInfoMsg(msg))
            this.conn.on('activate', (event) => this.handleDebugActivate(event))
            this.conn.on('debug', (event) => this.handleDebug(event))
            this.conn.on('debug-return', (event) => this.handleDebugReturn(event))
            this.conn.on('read-string', (event) => this.handleReadString(event))
            this.conn.on('write-string', (event) => this.handleWriteString(event))
            this.conn.on('close', () => this.onClose())

            const resp = await this.conn.connect()
            await this.view.open()
            await this.view.show()

            await this.handleConnInfo(resp.info)
            await this.conn.swankRequire()
            await this.conn.replCreate()
        } catch (err) {
            this.conn = undefined
            throw err
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

    addHistory(text: string, pkg: string) {
        this.history.add(text, pkg)
    }

    historyItems(): HistoryItem[] {
        return this.history.list
    }

    async inspector(text: string, pkg: string) {
        if (this.conn === undefined) {
            return
        }

        const resp = await this.conn.inspector(text, pkg)

        if (resp instanceof response.InitInspect) {
            this.showInspector(resp)
        }
    }

    async inspectorRefresh() {
        if (this.conn === undefined) {
            return
        }

        const resp = await this.conn.inspectorRefresh()

        if (resp instanceof response.InitInspect) {
            this.showInspector(resp)
        }
    }

    async inspectorPrev() {
        if (this.conn === undefined) {
            return
        }

        const resp = await this.conn.inspectorPrev()

        if (resp instanceof response.InitInspect) {
            this.showInspector(resp)
        }
    }

    async inspectorNext() {
        if (this.conn === undefined) {
            return
        }

        const resp = await this.conn.inspectorNext()

        if (resp instanceof response.InitInspect) {
            this.showInspector(resp)
        }
    }

    async inspectorQuit() {
        if (this.conn === undefined) {
            return
        }

        await this.conn.inspectorQuit()

        this.inspectorView?.stop()
    }

    async findDefs(label: string, pkg: string) {
        return await this.conn?.findDefs(label, pkg)
    }

    async loadFile(path: string, showMsgs: boolean = true) {
        const remotePath = xlatePath(path)

        if (showMsgs) {
            await this.view?.addText(`;; Loading ${remotePath}${EOL}`)
        }

        await this.conn?.loadFile(remotePath)

        if (showMsgs) {
            await this.view?.addTextAndPrompt(`;; Done loading ${remotePath}${EOL}`)
        }
    }

    async abort() {
        if (this.conn === undefined || this.dbgView === undefined) {
            vscode.window.showInformationMessage('No debug to abort')
            return
        }

        await this.conn.debugAbort(this.dbgView.event.threadID)
    }

    async nthRestart(n: number, level?: number, threadID?: number) {
        let id = threadID
        let lvl = level

        if (this.dbgView !== undefined) {
            lvl = this.dbgView.activate?.level
            id = id ?? this.dbgView.event.threadID

            this.dbgView.stop()
            this.dbgView = undefined
        }

        if (this.conn === undefined || id === undefined || lvl === undefined) {
            vscode.window.showInformationMessage('No debug to restart')
            return
        }

        await this.conn.nthRestart(id, lvl, n)
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

        if (resp instanceof response.Eval && resp.result !== undefined) {
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

        if (resp instanceof response.Eval && resp.result !== undefined) {
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

        if (resp instanceof response.Eval && resp.result !== undefined) {
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

        if (resp instanceof response.Eval && resp.result !== undefined) {
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
                const resp = await this.conn.replEval(text, pkg)

                if (output) {
                    if (resp instanceof response.Eval && resp.result !== undefined) {
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

    private showInspector(resp: response.InitInspect) {
        if (this.inspectorView === undefined) {
            this.inspectorView = new Inspector(this.ctx, vscode.ViewColumn.Two)

            this.inspectorView.on('inspect-part', async (ndx) => {
                const resp = await this.conn?.inspectNthPart(ndx)

                if (resp instanceof response.InitInspect) {
                    this.inspectorView?.show(resp.title, resp.content)
                }
            })

            this.inspectorView.on('inspector-action', async (ndx) => {
                const resp = await this.conn?.inspectorNthAction(ndx)

                if (resp instanceof response.InitInspect) {
                    this.inspectorView?.show(resp.title, resp.content)
                }
            })
        }

        this.inspectorView.show(resp.title, resp.content)
    }

    private handleDebugActivate(event: DebugActivate) {
        if (this.dbgView === undefined) {
            vscode.window.showInformationMessage(`Debug could not activate ${event.threadID}`)
            return
        }

        this.dbgView.on('restart', (ndx: number, restart: Restart) => this.nthRestart(ndx, event.level, event.threadID))

        this.dbgView.activate = event

        this.dbgView.run()
    }

    private handleDebug(event: Debug) {
        const view =
            this.dbgView ??
            new DebugView(this.ctx, `Debug TH-${event.threadID}`, this.view?.getViewColumn() ?? vscode.ViewColumn.Beside, event)

        view.on('frame-restart', async (ndx: number) => this.conn?.frameRestart(event.threadID, ndx))

        view.on('frame-eval', async (ndx: number, text: string) => {
            const result = await this.evalInFrame(ndx, text, event.threadID)

            if (result !== undefined) {
                await this.updateLocals(view, ndx, event.threadID)
                view.setEvalResponse(ndx, result)
            }
        })

        view.on('frame-locals', async (ndx: number) => this.updateLocals(view, ndx, event.threadID))

        this.dbgView = view
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

        if (resp instanceof response.Eval && resp.result !== undefined) {
            return unescape(resp.result.join(''))
        }
    }

    private async retrieveFrameLocals(ndx: number, threadID: number) {
        return await this.conn?.frameLocals(threadID, ndx)
    }

    private async handleDebugReturn(event: DebugReturn) {
        if (this.dbgView === undefined) {
            return
        }

        this.dbgView.stop()
        this.dbgView = undefined
    }

    private displayErrMsg(msg: unknown) {
        vscode.window.showErrorMessage(format(msg))
    }

    private displayInfoMsg(msg: unknown) {
        vscode.window.showInformationMessage(format(msg))
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

    private async handleReadString(event: ReadString) {
        const text = await vscode.window.showInputBox({ placeHolder: 'Enter text' })

        if (text !== undefined) {
            this.conn?.returnString(`${text}${EOL}`, event.threadID, event.tag)
        } else {
            this.conn?.interrupt(event.threadID)
        }
    }

    private async handleWriteString(event: WriteString) {
        const converted = convert(event.text)

        if (isString(converted)) {
            const str = unescape(converted as string)
            await this.view?.addText(str)
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
