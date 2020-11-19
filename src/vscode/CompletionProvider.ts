import { CompletionItem, Position } from 'vscode'
import { exprToString, findAtom, findExpr, findInnerExpr, isLetName, posInExpr } from '../lisp'
import { Defun, Expr, Let, SExpr } from '../lisp/Expr'
import { PackageMgr } from '../lisp/PackageMgr'
import { Repl } from './repl'

export class CompletionProvider {
    packageMgr: PackageMgr

    constructor(pkgMgr: PackageMgr) {
        this.packageMgr = pkgMgr
    }

    async getCompletions(repl: Repl | undefined, exprs: Expr[], pos: Position): Promise<CompletionItem[]> {
        const expr = findAtom(exprs, pos)
        const innerExpr = findInnerExpr(exprs, pos)
        let str = ''

        if (expr !== undefined) {
            const exprStr = exprToString(expr)
            if (exprStr !== undefined) {
                str = exprStr
            }
        }

        const getFromRepl = repl !== undefined && str !== ''

        if (innerExpr instanceof SExpr && innerExpr.getName()?.toUpperCase() === 'IN-PACKAGE') {
            return repl !== undefined && getFromRepl ? this.replPkgCompletions(repl, str) : this.staticPkgCompletions(exprs, pos)
        }

        return repl !== undefined && getFromRepl ? this.replCompletions(repl, str) : this.staticCompletions(exprs, pos)
    }

    async replPkgCompletions(repl: Repl, str: string): Promise<CompletionItem[]> {
        const names = await repl.getPackageNames()
        const items = []

        for (const name of names) {
            const item = new CompletionItem(name.toLowerCase())

            items.push(item)
        }

        return items
    }

    async replCompletions(repl: Repl, str: string): Promise<CompletionItem[]> {
        const comps = await repl.getCompletions(str)
        const items = []

        for (const comp of comps) {
            const item = new CompletionItem(comp.toLowerCase())
            const doc = await repl.getDoc(item.label)

            item.documentation = doc

            items.push(item)
        }

        return items
    }

    staticPkgCompletions(exprs: Expr[], pos: Position): CompletionItem[] {
        const pkgs = this.packageMgr.pkgs
        const pkgNames = Object.keys(pkgs)

        return pkgNames.map((pkg) => new CompletionItem(pkg.toLowerCase()))
    }

    staticCompletions(exprs: Expr[], pos: Position): CompletionItem[] {
        const expr = findExpr(exprs, pos)
        if (expr === undefined) {
            return []
        }

        const symbols = this.packageMgr.getSymbols(expr.start.line)
        if (symbols === undefined) {
            return []
        }

        const locals = this.getLocals(expr, pos)
        const completions = locals.concat(symbols)

        return completions.map((item) => new CompletionItem(item.toLowerCase()))
    }

    getLocals(expr: Expr, pos: Position): string[] {
        if (!(expr instanceof SExpr) || !posInExpr(expr, pos)) {
            return []
        }

        let locals: string[] = []
        const name = expr.getName()?.toUpperCase()

        if (name === 'DEFUN') {
            const defun = Defun.from(expr)
            if (defun !== undefined) {
                locals = locals.concat(defun.args)
                defun.body.forEach((expr) => (locals = locals.concat(this.getLocals(expr, pos))))
            }
        } else if (isLetName(name)) {
            const letExpr = Let.from(expr)
            if (letExpr !== undefined) {
                locals = locals.concat(Object.keys(letExpr.vars))
                letExpr.body.forEach((expr) => (locals = locals.concat(this.getLocals(expr, pos))))
            }
        }

        return locals
    }
}
