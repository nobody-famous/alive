import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { allLabels } from '../../lisp/keywords'
import { SwankConn } from '../../swank/SwankConn'
import { ConnInfo } from '../../swank/Types'
import { FileView } from './FileView'
import { View } from './View'
import { format } from 'util'
import { Lexer, Parser, Expr, InPackage } from '../../lisp'
import { convert } from '../../swank/SwankUtils'

export class Repl extends EventEmitter {
    conn?: SwankConn
    view?: View
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

    displayErrMsg(msg: unknown) {
        vscode.window.showErrorMessage(format(msg))
    }

    displayInfoMsg(msg: unknown) {
        vscode.window.showInformationMessage(format(msg))
    }

    async getKwDocs() {
        if (this.conn === undefined) {
            return
        }

        for (const label of allLabels) {
            const resp = await this.conn.docSymbol(label, ':cl-user')

            this.kwDocs[label] = resp.doc
        }
    }

    onClose() {
        this.view?.close()

        this.conn = undefined
        this.view = undefined

        this.emit('close')
    }

    handleConnInfo(info: ConnInfo) {
        if (this.view === undefined) {
            return
        }

        if (info.package?.prompt !== undefined) {
            this.view.setPrompt(info.package.prompt)
            this.view.show()
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

    async getCompletions(prefix: string): Promise<string[]> {
        if (this.conn === undefined) {
            return []
        }

        try {
            const resp = await this.conn.completions(prefix, ':cl-user')
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
            const resp = await this.conn.opArgsList(name, ':cl-user')
            return resp.desc
        } catch (err) {
            return ''
        }
    }

    parseEvalText(text: string): Expr | undefined {
        const lex = new Lexer(text)
        const parser = new Parser(lex.getTokens())
        const exprs = parser.parse()

        return exprs.length > 0 ? exprs[0] : undefined
    }

    async evalInPackage(text: string) {
        const expr = this.parseEvalText(text)
        if (expr instanceof InPackage) {
            vscode.window.showInformationMessage(`setPackage ${expr.name}`)
            await this.conn?.setPackage(expr.name)
        }
    }

    async changePackage(expr: InPackage) {
        const pkgName = expr.name.startsWith(':') ? expr.name : `:${expr.name}`
        const pkg = await this.conn?.setPackage(pkgName)
        const infoResp = await this.conn?.connectionInfo(pkgName)

        if (infoResp !== undefined) {
            this.handleConnInfo(infoResp.info)
        }
    }

    async send(text: string) {
        if (this.conn === undefined || this.view === undefined) {
            return
        }

        try {
            await this.view.show()

            const expr = this.parseEvalText(text)
            if (expr instanceof InPackage) {
                await this.changePackage(expr)
            } else {
                const resp = await this.conn.eval(text)
                this.view.addText(resp.result.join(''))
            }
        } catch (err) {
            this.emit('error', err)
        }
    }
}
