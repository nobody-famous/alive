import { format } from 'util'
import * as vscode from 'vscode'
import { CompletionItem, Position } from 'vscode'
import { exprToString, findAtom, findInnerExpr } from '../../lisp'
import { Expr, SExpr } from '../../lisp/Expr'
import { Repl } from '../repl'
import { ExtensionState } from '../Types'
import { getDocumentExprs, getPkgName, updatePkgMgr } from '../Utils'

export function getCompletionProvider(state: ExtensionState): vscode.CompletionItemProvider {
    return new Provider(state)
}

class Provider implements vscode.CompletionItemProvider {
    state: ExtensionState

    constructor(state: ExtensionState) {
        this.state = state
    }

    async provideCompletionItems(document: vscode.TextDocument, pos: vscode.Position) {
        try {
            if (this.state.repl === undefined) {
                return
            }

            const exprs = getDocumentExprs(document)

            await updatePkgMgr(this.state, document, exprs)

            const atom = findAtom(exprs, pos)
            if (atom?.isComment() || atom?.isError()) {
                return []
            }

            const textStr = atom !== undefined ? exprToString(atom) : undefined
            let pkgName = getPkgName(document, pos.line, this.state.pkgMgr, this.state.repl)

            if (atom !== undefined && textStr !== undefined && !textStr.startsWith('#')) {
                const ndx = textStr.indexOf(':')
                const sepPos = atom.start.character + ndx

                if (ndx > 0 && pos.character > sepPos) {
                    pkgName = textStr.substr(0, ndx)
                }
            }

            if (pkgName === undefined) {
                return []
            }

            return await this.getCompletions(this.state.repl, exprs, pos, pkgName)
        } catch (err) {
            vscode.window.showErrorMessage(format(err))
            return []
        }
    }

    async getCompletions(repl: Repl | undefined, exprs: Expr[], pos: Position, pkg: string): Promise<CompletionItem[]> {
        const expr = findAtom(exprs, pos)
        const innerExpr = findInnerExpr(exprs, pos)
        let locals: string[] = []
        let str = ''

        if (expr !== undefined) {
            const exprStr = exprToString(expr)

            if (exprStr !== undefined && !exprStr.startsWith('#')) {
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
