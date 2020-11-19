import { EventEmitter } from 'events'
import { format } from 'util'
import * as vscode from 'vscode'
import { Expr, InPackage, Lexer, Parser } from '../../lisp'
import { allLabels } from '../../lisp/keywords'
import { SwankConn } from '../../swank/SwankConn'
import { convert } from '../../swank/SwankUtils'
import { ConnInfo } from '../../swank/Types'
import { FileView } from './FileView'
import { View } from './View'

export class Repl extends EventEmitter {
    conn?: SwankConn
    view?: View
    curPackage: string = ':cl-user'
    host: string
    port: number
    kwDocs: { [index: string]: string } = {}

    constructor(host: string, port: number) {
        super()

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
            this.conn.on('activate', (event) => this.displayInfoMsg(event))
            this.conn.on('debug', (event) => this.displayInfoMsg(event))
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
            this.conn.trace = true
            const resp = await this.conn.compileFile(fileName)
            vscode.window.showInformationMessage(format(resp))
        } catch (err) {
            vscode.window.showErrorMessage(err)
        }
        this.conn.trace = false
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
                    const str = resp.result.join('').replace(/\\./g, (item) => (item.length > 0 ? item.charAt(1) : item))
                    this.view.addText(str)
                }
            }
        } catch (err) {
            vscode.window.showErrorMessage(err)
        }
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
