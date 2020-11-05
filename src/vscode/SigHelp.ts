import { Position, SignatureHelp, TextDocument } from 'vscode'
import { Expr, exprToString, findExpr, SExpr } from '../lisp'
import { Repl } from './repl'
import { getDocumentExprs } from './Utils'

export async function getHelp(repl: Repl | undefined, doc: TextDocument, pos: Position): Promise<SignatureHelp> {
    const exprs = getDocumentExprs(doc)
    const expr = findExpr(exprs, pos)

    if (!(expr instanceof SExpr) || repl === undefined) {
        return new SignatureHelp()
    }

    return getSexprHelp(repl, expr as SExpr)
}

async function getSexprHelp(repl: Repl, expr: SExpr): Promise<SignatureHelp> {
    const label = exprToString(expr.parts[0])

    if (label === undefined) {
        return new SignatureHelp()
    }

    return await getFuncHelp(repl, label, expr.parts.slice(1))
}

async function getFuncHelp(repl: Repl, label: string, args: Expr[]): Promise<SignatureHelp> {
    const desc = await repl.getOpArgs(label)
    console.log(`getFuncHelp`, desc)
    return new SignatureHelp()
}
