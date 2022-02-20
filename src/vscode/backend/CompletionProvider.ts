import { format } from 'util'
import * as vscode from 'vscode'
import { Atom, Expr, exprToString, findAtom, findInnerExpr, Lexer, Parser, SExpr } from '../../lisp'
import { Position } from '../../lisp/Types'
import { Repl } from '../repl'
import { SwankBackendState } from '../Types'
import { getDocumentExprs, toVscodePos } from '../Utils'

export class CompletionProvider implements vscode.CompletionItemProvider {
    state: SwankBackendState

    constructor(state: SwankBackendState) {
        this.state = state
    }

    async provideCompletionItems(document: vscode.TextDocument, pos: vscode.Position) {
        try {
            if (!this.state.extState.backend?.isConnected()) {
                return
            }

            const exprs = getDocumentExprs(document)

            await this.state.pkgMgr.update(this.state.repl, document, exprs)

            const atom = findAtom(exprs, pos)
            if (atom?.isComment() || atom?.isError()) {
                return []
            }

            const textStr = atom !== undefined ? exprToString(atom) : undefined
            let pkgName = this.state.extState.backend?.getPkgName(document, pos.line)

            if (atom !== undefined && textStr !== undefined && !textStr.startsWith('#')) {
                const ndx = textStr.indexOf(':')
                const sepPos = atom.start.character + ndx

                if (ndx > 0 && pos.character > sepPos) {
                    const newName = await this.state.pkgMgr.resolveNickname(
                        this.state.repl!,
                        document.fileName,
                        pos.line,
                        textStr.substr(0, ndx)
                    )
                    pkgName = newName ?? pkgName
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

    async getCompletions(repl: Repl | undefined, exprs: Expr[], pos: Position, pkg: string): Promise<vscode.CompletionItem[]> {
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

        const comps = locals.map((i) => new vscode.CompletionItem(i.toLowerCase()))
        const replComps = repl !== undefined ? await this.replCompletions(repl, expr, str, pkg) : []

        return comps.concat(replComps)
    }

    private async replPkgCompletions(repl: Repl): Promise<vscode.CompletionItem[]> {
        const names = await repl.getPackageNames()
        const items = []

        for (const name of names) {
            const item = new vscode.CompletionItem(name.toLowerCase())

            items.push(item)
        }

        return items
    }

    private async replCompletions(repl: Repl, expr: Expr | undefined, str: string, pkg: string): Promise<vscode.CompletionItem[]> {
        const comps = await repl.getCompletions(str, pkg)
        const items = []

        const fetchCompData = async (label: string, pkg: string) => {
            let doc = undefined
            let args = undefined

            try {
                doc = await repl.getDoc(label, pkg)
                args = await repl.getOpArgs(label, pkg)
            } catch (err) {
                doc = ''
                args = ''
            }

            return { label, doc, args }
        }

        const argsToSnippet = (args: string) => {
            const lex = new Lexer(args)
            const parser = new Parser(lex.getTokens())
            const exprs = parser.parse()
            const sexpr = exprs[0] instanceof SExpr ? (exprs[0] as SExpr) : undefined

            if (sexpr === undefined) {
                return ''
            }

            const parts: string[] = []
            let num = 1

            const addToSnippet = (atom: Atom) => {
                const str = exprToString(atom)

                if (str !== undefined && str.charAt(0) !== '&') {
                    parts.push(`\${${num}:${str}}`)
                    num += 1
                }
            }

            for (let ndx = 1; ndx < sexpr.parts.length; ndx += 1) {
                const expr = sexpr.parts[ndx]

                if (expr instanceof Atom) {
                    addToSnippet(expr)
                } else if (expr instanceof SExpr) {
                    const name = expr.parts[0]

                    if (name instanceof Atom) {
                        addToSnippet(name)
                    }
                }
            }

            return parts.join(' ')
        }

        const tasks = []

        for (const comp of comps) {
            tasks.push(fetchCompData(comp, pkg))
        }

        const results = await Promise.all(tasks)

        for (const result of results) {
            const item = new vscode.CompletionItem(result.label.toLowerCase())

            if (expr !== undefined && str.startsWith(':')) {
                item.range = new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))
            }

            item.documentation = result.doc

            if (result.args !== undefined && result.args !== '') {
                item.insertText = new vscode.SnippetString(`${result.label} ${argsToSnippet(result.args)}`)
            }

            items.push(item)
        }

        return items
    }
}