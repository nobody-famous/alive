import { CompletionItem, Position } from 'vscode'
import { exprToString, findAtom, findInnerExpr } from '../lisp'
import { Expr, SExpr } from '../lisp/Expr'
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

                const ndx = str.indexOf(':')

                if (ndx > 0) {
                    str = str.substr(ndx + 1)
                }
            }
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
}
