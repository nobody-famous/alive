import { Position, SignatureHelp, TextDocument, SignatureInformation, ParameterInformation } from 'vscode'
import { Expr, exprToString, findExpr, SExpr, Lexer, Parser, posInExpr } from '../lisp'
import { Repl } from './repl'
import { getDocumentExprs } from './Utils'

export async function getHelp(repl: Repl | undefined, doc: TextDocument, pos: Position): Promise<SignatureHelp> {
    const exprs = getDocumentExprs(doc)
    const expr = findExpr(exprs, pos)

    if (!(expr instanceof SExpr) || repl === undefined) {
        return new SignatureHelp()
    }

    return getSexprHelp(repl, expr as SExpr, pos)
}

async function getSexprHelp(repl: Repl, expr: SExpr, pos: Position): Promise<SignatureHelp> {
    const label = exprToString(expr.parts[0])

    if (label === undefined) {
        return new SignatureHelp()
    }

    return await getFuncHelp(repl, label, expr.parts.slice(1), pos)
}

async function getFuncHelp(repl: Repl, label: string, args: Expr[], pos: Position): Promise<SignatureHelp> {
    const desc = await repl.getOpArgs(label)
    const descExprs = parseFuncDesc(desc)

    if (descExprs.length === 0) {
        return new SignatureHelp()
    }

    const descExpr = descExprs[0]

    return exprToHelp(desc, descExpr, args, pos)
}

function exprToHelp(desc: string, expr: Expr, args: Expr[], pos: Position): SignatureHelp {
    const help = new SignatureHelp()

    if (!(expr instanceof SExpr)) {
        return help
    }

    const sigInfo = new SignatureInformation(desc)
    sigInfo.activeParameter = undefined

    for (let ndx = 1; ndx < expr.parts.length; ndx += 1) {
        const part = expr.parts[ndx]
        const arg = ndx <= args.length ? args[ndx - 1] : undefined
        const range: [number, number] = [part.start.character, part.end.character]

        if ((sigInfo.activeParameter === undefined && arg === undefined) || (arg !== undefined && posInExpr(arg, pos))) {
            sigInfo.activeParameter = ndx - 1
        }

        sigInfo.parameters.push(new ParameterInformation(range))
    }

    if (sigInfo.activeParameter === undefined) {
        sigInfo.activeParameter = expr.parts.length
    }

    help.signatures.push(sigInfo)
    help.activeSignature = 0

    return help
}

function parseFuncDesc(desc: string): Expr[] {
    const lex = new Lexer(desc)
    const parser = new Parser(lex.getTokens())

    return parser.parse()
}
