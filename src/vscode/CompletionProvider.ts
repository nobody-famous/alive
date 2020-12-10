import { CompletionItem, Position } from 'vscode'
import { exprToString, findAtom, findInnerExpr, isLetName, posInExpr } from '../lisp'
import { Defun, Expr, Let, SExpr } from '../lisp/Expr'
import { PackageMgr } from './PackageMgr'
import { Repl } from './repl'

export class CompletionProvider {
    packageMgr: PackageMgr

    constructor(pkgMgr: PackageMgr) {
        this.packageMgr = pkgMgr
    }

    async getCompletions(repl: Repl | undefined, exprs: Expr[], pos: Position, pkg: string): Promise<CompletionItem[]> {
        const expr = findAtom(exprs, pos)
        const innerExpr = findInnerExpr(exprs, pos)
        let locals: string[] = []
        let str = ''

        if (expr !== undefined) {
            const exprStr = exprToString(expr)

            if (exprStr !== undefined) {
                str = exprStr
            }
        }

        if (innerExpr !== undefined) {
            locals = this.getLocals(innerExpr, pos)
        }

        if (innerExpr instanceof SExpr && innerExpr.getName()?.toUpperCase() === 'IN-PACKAGE') {
            return repl !== undefined ? await this.replPkgCompletions(repl) : []
        }

        const comps = locals.map((i) => new CompletionItem(i.toLowerCase()))
        const replComps = repl !== undefined ? await this.replCompletions(repl, str, pkg) : []

        return comps.concat(replComps)
    }

    private async replPkgCompletions(repl: Repl): Promise<CompletionItem[]> {
        const names = await repl.getPackageNames()
        const items = []

        for (const name of names) {
            const item = new CompletionItem(name.toLowerCase())

            items.push(item)
        }

        return items
    }

    private async replCompletions(repl: Repl, str: string, pkg: string): Promise<CompletionItem[]> {
        const comps = await repl.getCompletions(str, pkg)
        const items = []

        for (const comp of comps) {
            const item = new CompletionItem(comp.toLowerCase())
            const doc = await repl.getDoc(item.label, pkg)

            item.documentation = doc

            items.push(item)
        }

        return items
    }

    private getLocals(expr: Expr, pos: Position): string[] {
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
