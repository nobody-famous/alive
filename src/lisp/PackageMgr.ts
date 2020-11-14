import { allLabels } from './keywords'
import * as types from './Types'
import { DefPackage, Defun, Expr, InPackage, SExpr } from './Expr'
import { Node } from './Node'
import { exprToString } from './Utils'

const CL_USER_PKG = 'CL-USER'

interface SymbolDict {
    [index: string]: boolean
}

class Package {
    name: string
    exports: string[]
    uses: string[]
    symbols: { [index: string]: SymbolDict | Expr }
    startLine?: number
    endLine?: number

    constructor(name: string, startLine?: number, endLine?: number) {
        this.name = name.toUpperCase()
        this.exports = []
        this.uses = []
        this.symbols = {}
        this.startLine = startLine
        this.endLine = endLine
    }
}

export class PackageMgr {
    curPackage?: Package
    pkgs: { [index: string]: Package }

    constructor() {
        this.curPackage = undefined
        this.pkgs = {}
        this.pkgs[CL_USER_PKG] = new Package(CL_USER_PKG, -1, -1)

        this.initMainPackage()
    }

    update(exprs: Expr[]) {
        this.curPackage = this.pkgs[CL_USER_PKG]

        for (let ndx = 0; ndx < exprs.length; ndx += 1) {
            const expr = exprs[ndx]

            this.curPackage.endLine = expr.end.line
            this.processExpr(expr)
        }
    }

    initMainPackage() {
        this.pkgs[CL_USER_PKG].startLine = 0

        for (const label of allLabels) {
            this.pkgs[CL_USER_PKG].exports.push(label.toUpperCase())
            this.pkgs[CL_USER_PKG].symbols[label.toUpperCase()] = {}
        }
    }

    getSymbols(line: number) {
        if (this.curPackage === undefined) {
            return undefined
        }

        let symbols: SymbolDict = {}
        const uses = this.curPackage.uses

        for (let pkg of Object.values(this.pkgs)) {
            if (pkg.startLine !== undefined && pkg.endLine !== undefined && pkg.startLine <= line && pkg.endLine >= line) {
                Object.keys(pkg.symbols).forEach((sym) => (symbols[sym] = true))
            } else {
                const usesPkg = uses.includes(pkg.name)
                const names = pkg.exports.map((label) => (usesPkg ? label : `${pkg.name}:${label}`))

                names.forEach((name) => (symbols[name] = true))
            }
        }

        return Object.keys(symbols)
    }

    processExpr(expr: Expr) {
        if (!(expr instanceof SExpr) || expr.parts.length === 0) {
            return
        }

        const name = exprToString(expr.parts[0])?.toUpperCase()

        if (name === 'DEFPACKAGE') {
            this.processDefPackage(expr)
        } else if (expr instanceof Defun) {
            this.processDefun(expr)
        } else if (expr instanceof InPackage) {
            this.processInPackage(expr)
        }
    }

    processDefun(defunExpr: Expr) {
        if (this.curPackage === undefined) {
            return
        }

        const expr = defunExpr as Defun
        this.curPackage.symbols[expr.name] = expr
    }

    processDefPackage(sexpr: SExpr) {
        const expr = DefPackage.from(sexpr)

        if (expr === undefined) {
            return
        }

        const pkg = new Package(expr.name, expr.start.line, expr.end.line)

        pkg.exports = expr.exports !== undefined ? expr.exports : []
        pkg.uses = expr.uses !== undefined ? expr.uses : []

        this.pkgs[expr.name] = pkg
    }

    packageElement(pkg: Package, node: Node) {
        if (node.kids.length === 0) {
            return
        }

        const ndx = node.kids[0].value?.type === types.WHITE_SPACE ? 1 : 0
        const token = node.kids[ndx].value

        if (token?.type !== types.SYMBOL) {
            return
        }

        if (token.text === ':EXPORT') {
            this.packageExports(pkg, node.kids.slice(ndx + 1))
        } else if (token.text === ':USE') {
            this.packageUses(pkg, node.kids.slice(ndx + 1))
        }
    }

    packageExports(pkg: Package, nodes: Node[]) {
        for (const node of nodes) {
            const token = node.value
            if (token === undefined || token.type === types.WHITE_SPACE) {
                continue
            }

            const name = token.type === types.SYMBOL ? token.text.substring(1) : token.text

            pkg.exports.push(name.toUpperCase())
        }
    }

    packageUses(pkg: Package, nodes: Node[]) {
        for (const node of nodes) {
            const token = node.value
            if (token === undefined || token.type === types.WHITE_SPACE) {
                continue
            }

            let name = token.type === types.SYMBOL ? token.text.substring(1).toUpperCase() : token.text.toUpperCase()

            if (name === 'CL' || name === 'COMMON-LISP' || name === 'COMMON-LISP-USER') {
                name = CL_USER_PKG
            }

            pkg.uses.push(name)
        }
    }

    processInPackage(expr: SExpr) {
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

        if (this.curPackage !== undefined) {
            this.curPackage.endLine = expr.start.line - 1
        }

        this.curPackage = this.pkgs[name]
        this.curPackage.startLine = expr.start.line
    }
}
