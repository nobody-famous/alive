import { ParameterInformation, Position, SignatureHelp, SignatureInformation, TextDocument } from 'vscode'
import { Expr, exprToString, findInnerExpr, Lexer, Parser, SExpr } from '../lisp'
import { Repl } from './repl'
import { getDocumentExprs } from './Utils'

export async function getHelp(repl: Repl | undefined, doc: TextDocument, pos: Position, pkg: string): Promise<SignatureHelp> {
    const exprs = getDocumentExprs(doc)
    const expr = findInnerExpr(exprs, pos)

    if (!(expr instanceof SExpr) || repl === undefined) {
        return new SignatureHelp()
    }

    return getSexprHelp(repl, expr as SExpr, pos, pkg)
}

async function getSexprHelp(repl: Repl, expr: SExpr, pos: Position, pkg: string): Promise<SignatureHelp> {
    const label = exprToString(expr.parts[0])

    if (label === undefined) {
        return new SignatureHelp()
    }

    return await getFuncHelp(repl, label, expr.parts.slice(1), pos, pkg)
}

async function getFuncHelp(repl: Repl, label: string, args: Expr[], pos: Position, pkg: string): Promise<SignatureHelp> {
    const desc = await repl.getOpArgs(label, pkg)
    const descExprs = parseFuncDesc(desc)

    if (descExprs.length === 0) {
        return new SignatureHelp()
    }

    const descExpr = descExprs[0]

    return exprToHelp(desc, descExpr, args, pos)
}

function exprToHelp(desc: string, descExpr: Expr, args: Expr[], pos: Position): SignatureHelp {
    const help = new SignatureHelp()

    if (!(descExpr instanceof SExpr)) {
        return help
    }

    const sigInfo = buildSigInfo(desc, descExpr.parts.slice(1), args, pos)

    help.signatures.push(sigInfo)
    help.activeSignature = 0

    return help
}

function buildSigInfo(desc: string, descParts: Expr[], args: Expr[], pos: Position): SignatureInformation {
    const sigInfo = new SignatureInformation(desc)
    let argsNdx: number = 0

    descParts.forEach((part, descNdx) => {
        const range: [number, number] = [part.start.character, part.end.character]

        sigInfo.parameters.push(new ParameterInformation(range))
        sigInfo.activeParameter = -1

        argsNdx += 1
    })

    return sigInfo
}

function parseFuncDesc(desc: string): Expr[] {
    const lex = new Lexer(desc)
    const parser = new Parser(lex.getTokens())

    return parser.parse()
}
