import * as vscode from 'vscode'
import { Expr, exprToString, findInnerExpr, Lexer, Parser, SExpr } from '../../lisp'
import { ExtensionState } from '../Types'
import { getDocumentExprs } from '../Utils'

export function getSigHelpProvider(state: ExtensionState): vscode.SignatureHelpProvider {
    return new Provider(state)
}

class Provider implements vscode.SignatureHelpProvider {
    state: ExtensionState

    constructor(state: ExtensionState) {
        this.state = state
    }

    async provideSignatureHelp(document: vscode.TextDocument, pos: vscode.Position): Promise<vscode.SignatureHelp> {
        const pkg = this.state.pkgMgr.getPackageForLine(document.fileName, pos.line)

        if (pkg === undefined) {
            return new vscode.SignatureHelp()
        }

        return await this.getHelp(document, pos, pkg.name)
    }

    private async getHelp(doc: vscode.TextDocument, pos: vscode.Position, pkg: string): Promise<vscode.SignatureHelp> {
        const exprs = getDocumentExprs(doc)
        const expr = findInnerExpr(exprs, pos)

        if (!(expr instanceof SExpr) || this.state.repl === undefined) {
            return new vscode.SignatureHelp()
        }

        return this.getSexprHelp(expr as SExpr, pos, pkg)
    }

    private async getSexprHelp(expr: SExpr, pos: vscode.Position, pkg: string): Promise<vscode.SignatureHelp> {
        const label = exprToString(expr.parts[0])

        if (label === undefined) {
            return new vscode.SignatureHelp()
        }

        return await this.getFuncHelp(label, expr.parts.slice(1), pos, pkg)
    }

    private async getFuncHelp(label: string, args: Expr[], pos: vscode.Position, pkg: string): Promise<vscode.SignatureHelp> {
        const desc = await this.state.repl?.getOpArgs(label, pkg)
        const descExprs = desc !== undefined ? this.parseFuncDesc(desc) : []

        if (desc === undefined || descExprs.length === 0) {
            return new vscode.SignatureHelp()
        }

        const descExpr = descExprs[0]

        return this.exprToHelp(desc, descExpr, args, pos)
    }

    private exprToHelp(desc: string, descExpr: Expr, args: Expr[], pos: vscode.Position): vscode.SignatureHelp {
        const help = new vscode.SignatureHelp()

        if (!(descExpr instanceof SExpr)) {
            return help
        }

        const sigInfo = this.buildSigInfo(desc, descExpr.parts.slice(1), args, pos)

        help.signatures.push(sigInfo)
        help.activeSignature = 0

        return help
    }

    private buildSigInfo(desc: string, descParts: Expr[], args: Expr[], pos: vscode.Position): vscode.SignatureInformation {
        const sigInfo = new vscode.SignatureInformation(desc)
        let argsNdx: number = 0

        descParts.forEach((part, descNdx) => {
            const range: [number, number] = [part.start.character, part.end.character]

            sigInfo.parameters.push(new vscode.ParameterInformation(range))
            sigInfo.activeParameter = -1

            argsNdx += 1
        })

        return sigInfo
    }

    private parseFuncDesc(desc: string): Expr[] {
        const lex = new Lexer(desc)
        const parser = new Parser(lex.getTokens())

        return parser.parse()
    }
}
