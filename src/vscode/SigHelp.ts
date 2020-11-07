import { ParameterInformation, Position, SignatureHelp, SignatureInformation, TextDocument } from 'vscode'
import { Expr, exprToString, findExpr, Lexer, Parser, posInExpr, SExpr } from '../lisp'
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
    let foundOptional: boolean = false
    let restNdx: number | undefined = undefined

    descParts.forEach((part, ndx) => {
        if (foundOptional) {
            ndx -= 1
        }

        const arg = ndx <= args.length ? args[ndx] : undefined
        const range: [number, number] = [part.start.character, part.end.character]

        if (isAmpOption(part, '&optional')) {
            foundOptional = true
            return
        } else if (isAmpOption(part, '&rest')) {
            restNdx = ndx
            return
        } else if ((sigInfo.activeParameter === undefined && arg === undefined) || (arg !== undefined && posInExpr(arg, pos))) {
            sigInfo.activeParameter = restNdx !== undefined ? restNdx : ndx
        }

        sigInfo.parameters.push(new ParameterInformation(range))
    })

    if (sigInfo.activeParameter === undefined) {
        if (restNdx !== undefined) {
            sigInfo.activeParameter = restNdx
        } else if (foundOptional) {
            sigInfo.activeParameter = descParts.length - 1
        } else {
            sigInfo.activeParameter = descParts.length
        }
    }

    return sigInfo
}

function isAmpOption(expr: Expr, target: string): boolean {
    const str = exprToString(expr)

    if (str === undefined) {
        return false
    }

    return str.toLowerCase() === target
}

function parseFuncDesc(desc: string): Expr[] {
    const lex = new Lexer(desc)
    const parser = new Parser(lex.getTokens())

    return parser.parse()
}
