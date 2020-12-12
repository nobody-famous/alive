import * as vscode from 'vscode'
import { Lexer, Token, types } from '../lisp'
import { DefPackage, Defun, Expr, SExpr } from '../lisp/Expr'
import { exprToString, isString } from '../lisp/Utils'
import { convert } from '../swank/SwankUtils'
import { Repl } from './repl'
import { toVscodePos } from './Utils'

const CL_USER_PKG = 'CL-USER'

interface SymbolDict {
    [index: string]: boolean
}

interface LineRange {
    start: number
    end: number
}

class Package {
    name: string
    exports: string[] = []
    uses: string[] = []
    symbols: { [index: string]: SymbolDict | Expr } = {}
    ranges: { [index: string]: LineRange } = {}

    constructor(name: string) {
        this.name = name.toUpperCase()
    }
}

export class PackageMgr {
    curPackage?: Package
    pkgs: { [index: string]: Package | undefined }

    constructor() {
        this.curPackage = undefined
        this.pkgs = {}
    }

    addPackage(name: string) {
        const pkgName = name.toUpperCase()

        if (this.pkgs[pkgName] === undefined) {
            this.pkgs[pkgName] = new Package(pkgName)
        }
    }

    async update(repl: Repl | undefined, doc: vscode.TextDocument | undefined, exprs: Expr[]) {
        this.curPackage = this.pkgs[CL_USER_PKG]

        if (this.curPackage === undefined) {
            return
        }

        const fileName = doc?.fileName

        if (fileName !== undefined) {
            this.purgeFilename(fileName)
        }

        if (fileName !== undefined && this.curPackage.ranges[fileName] === undefined) {
            this.curPackage.ranges[fileName] = { start: 0, end: 0 }
        }

        for (let ndx = 0; ndx < exprs.length; ndx += 1) {
            const expr = exprs[ndx]

            if (fileName !== undefined && this.curPackage.ranges[fileName] !== undefined) {
                this.curPackage.ranges[fileName].end = expr.end.line
            }

            await this.processExpr(repl, doc, expr)
        }
    }

    getPackageForLine(fileName: string, line: number): Package | undefined {
        for (const pkg of Object.values(this.pkgs)) {
            if (pkg === undefined) {
                continue
            }

            if (this.lineInPackage(fileName, line, pkg)) {
                return pkg
            }
        }

        return this.pkgs[CL_USER_PKG]
    }

    private purgeFilename(fileName: string) {
        for (const pkg of Object.values(this.pkgs)) {
            if (pkg === undefined) {
                continue
            }

            delete pkg.ranges[fileName]
        }
    }

    private lineInPackage(fileName: string, line: number, pkg: Package): boolean {
        if (pkg.ranges[fileName] === undefined) {
            return false
        }

        const start = pkg.ranges[fileName].start
        const end = pkg.ranges[fileName].end

        return start !== undefined && end !== undefined && start <= line && end >= line
    }

    private async processExpr(repl: Repl | undefined, doc: vscode.TextDocument | undefined, expr: Expr) {
        if (!(expr instanceof SExpr) || expr.parts.length === 0) {
            return
        }

        const name = exprToString(expr.parts[0])?.toUpperCase()

        if (name === 'DEFPACKAGE') {
            this.processDefPackage(expr)
        } else if (name === 'DEFUN') {
            this.processDefun(expr)
        } else if (name === 'IN-PACKAGE') {
            await this.processInPackage(repl, doc, expr)
        }
    }

    private processDefun(defunExpr: Expr) {
        if (this.curPackage === undefined) {
            return
        }

        const expr = defunExpr as Defun
        this.curPackage.symbols[expr.name] = expr
    }

    private processDefPackage(sexpr: SExpr) {
        const expr = DefPackage.from(sexpr)

        if (expr === undefined) {
            return
        }

        const pkg = new Package(expr.name)

        pkg.exports = expr.exports !== undefined ? expr.exports : []
        pkg.uses = expr.uses !== undefined ? expr.uses : []

        this.pkgs[expr.name] = pkg
    }

    private async processInPackage(repl: Repl | undefined, doc: vscode.TextDocument | undefined, expr: SExpr) {
        if (expr.parts.length < 2) {
            return
        }

        const fileName = doc?.fileName
        let name = await this.getNameString(repl, doc, expr)

        if (name === undefined) {
            return
        }

        if (name === 'COMMON-LISP-USER') {
            name = CL_USER_PKG
        }

        if (fileName !== undefined && this.curPackage?.ranges[fileName] !== undefined) {
            this.curPackage.ranges[fileName].end = expr.start.line - 1
        }

        if (this.pkgs[name] === undefined) {
            this.pkgs[name] = new Package(name)
        }

        this.curPackage = this.pkgs[name]

        if (fileName !== undefined && this.curPackage !== undefined) {
            this.removeDuplicates(fileName, expr.start.line)

            this.curPackage.ranges[fileName] = {
                start: expr.start.line + 1,
                end: expr.start.line + 1,
            }
        }
    }

    private async getNameString(
        repl: Repl | undefined,
        doc: vscode.TextDocument | undefined,
        expr: SExpr
    ): Promise<string | undefined> {
        if (repl === undefined || doc === undefined) {
            return undefined
        }

        const start = expr.parts[1].start
        const end = expr.parts[expr.parts.length - 1].end
        const range = new vscode.Range(toVscodePos(start), toVscodePos(end))
        const text = doc?.getText(range)

        if (text === undefined || !this.parsesOk(text)) {
            return
        }

        const resp = await repl?.eval(`(ignore-errors (string ${text}))`)

        if (resp === undefined) {
            return
        }

        const converted = convert(resp)

        if (!isString(converted)) {
            return
        }

        return (converted as string).toUpperCase()
    }

    private parsesOk(text: string): boolean {
        const lex = new Lexer(text)
        const tokens = lex.getTokens()

        for (const token of tokens) {
            if (this.isErrorToken(token)) {
                return false
            }

            if (token.text === ':') {
                return false
            }
        }

        return true
    }

    private isErrorToken(token: Token): boolean {
        switch (token.type) {
            case types.MISMATCHED_BAR:
            case types.MISMATCHED_CLOSE_PARENS:
            case types.MISMATCHED_OPEN_PARENS:
            case types.MISMATCHED_COMMENT:
            case types.MISMATCHED_DBL_QUOTE:
                return true
            default:
                return false
        }
    }

    private removeDuplicates(fileName: string, line: number) {
        for (const pkg of Object.values(this.pkgs)) {
            if (pkg === undefined) {
                continue
            }

            const ranges = pkg.ranges[fileName]

            if (ranges !== undefined && ranges.start === line) {
                delete pkg.ranges[fileName]
            }
        }
    }
}
