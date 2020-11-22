import { DefPackage, Defun, Expr, SExpr } from './Expr'
import { allLabels } from './keywords'
import { exprToString } from './Utils'

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
    pkgs: { [index: string]: Package }

    constructor() {
        this.curPackage = undefined
        this.pkgs = {}
        this.pkgs[CL_USER_PKG] = new Package(CL_USER_PKG)

        this.initMainPackage()
    }

    update(fileName: string | undefined, exprs: Expr[]) {
        this.curPackage = this.pkgs[CL_USER_PKG]

        if (fileName !== undefined && this.curPackage.ranges[fileName] === undefined) {
            this.curPackage.ranges[fileName] = { start: 0, end: 0 }
        }

        for (let ndx = 0; ndx < exprs.length; ndx += 1) {
            const expr = exprs[ndx]

            if (fileName !== undefined && this.curPackage.ranges[fileName] !== undefined) {
                this.curPackage.ranges[fileName].end = expr.end.line
            }

            this.processExpr(fileName, expr)
        }
    }

    initMainPackage() {
        for (const label of allLabels) {
            this.pkgs[CL_USER_PKG].exports.push(label.toUpperCase())
            this.pkgs[CL_USER_PKG].symbols[label.toUpperCase()] = {}
        }
    }

    getPackageForLine(fileName: string, line: number): Package {
        for (const pkg of Object.values(this.pkgs)) {
            if (this.lineInPackage(fileName, line, pkg)) {
                return pkg
            }
        }

        return this.pkgs[CL_USER_PKG]
    }

    private lineInPackage(fileName: string, line: number, pkg: Package): boolean {
        if (pkg.ranges[fileName] === undefined) {
            return false
        }

        const start = pkg.ranges[fileName].start
        const end = pkg.ranges[fileName].end

        return start !== undefined && end !== undefined && start <= line && end >= line
    }

    getSymbols(fileName: string, line: number) {
        if (this.curPackage === undefined) {
            return undefined
        }

        let symbols: SymbolDict = {}
        const uses = this.curPackage.uses

        for (let pkg of Object.values(this.pkgs)) {
            if (this.lineInPackage(fileName, line, pkg)) {
                Object.keys(pkg.symbols).forEach((sym) => (symbols[sym] = true))
            } else {
                const usesPkg = uses.includes(pkg.name)
                const names = pkg.exports.map((label) => (usesPkg ? label : `${pkg.name}:${label}`))

                names.forEach((name) => (symbols[name] = true))
            }
        }

        return Object.keys(symbols)
    }

    private processExpr(fileName: string | undefined, expr: Expr) {
        if (!(expr instanceof SExpr) || expr.parts.length === 0) {
            return
        }

        const name = exprToString(expr.parts[0])?.toUpperCase()

        if (name === 'DEFPACKAGE') {
            this.processDefPackage(expr)
        } else if (name === 'DEFUN') {
            this.processDefun(expr)
        } else if (name === 'IN-PACKAGE') {
            this.processInPackage(fileName, expr)
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

    private processInPackage(fileName: string | undefined, expr: SExpr) {
        if (expr.parts.length < 2) {
            return
        }

        let name = exprToString(expr.parts[1])

        if (name?.toUpperCase() === 'COMMON-LISP-USER') {
            name = CL_USER_PKG
        }

        if (name === undefined || this.pkgs[name] === undefined) {
            return
        }

        if (fileName !== undefined && this.curPackage !== undefined && this.curPackage.ranges[fileName] !== undefined) {
            this.curPackage.ranges[fileName].end = expr.start.line - 1
        }

        this.curPackage = this.pkgs[name]

        if (fileName !== undefined && this.curPackage !== undefined) {
            this.removeDuplicates(fileName, expr.start.line)

            this.curPackage.ranges[fileName] = {
                start: expr.start.line,
                end: expr.start.line,
            }
        }
    }

    private removeDuplicates(fileName: string, line: number) {
        for (const pkg of Object.values(this.pkgs)) {
            const ranges = pkg.ranges[fileName]

            if (ranges !== undefined && ranges.start === line) {
                delete pkg.ranges[fileName]
            }
        }
    }
}
