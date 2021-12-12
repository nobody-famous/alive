import * as vscode from 'vscode'
import { Atom, Expr, Lexer, Parser, SExpr } from '../../lisp'
import { Formatter } from '../format/Formatter'
import { HaveBody, Options } from '../format/Utils'
import { ExtensionState } from '../Types'
import { getDocumentExprs } from '../Utils'

export class FormatProvider implements vscode.DocumentFormattingEditProvider {
    state: ExtensionState

    constructor(state: ExtensionState) {
        this.state = state
    }

    async provideDocumentFormattingEdits(doc: vscode.TextDocument, opts: vscode.FormattingOptions) {
        const cfg = vscode.workspace.getConfiguration('alive')

        const lex = new Lexer(doc.getText())
        const tokens = lex.getTokens()

        const exprs = getDocumentExprs(doc)
        const haveBody: HaveBody = {}

        if (cfg.indentMacros === undefined || cfg.indentMacros !== false) {
            await this.findHaveBody(doc, exprs, haveBody)
        }

        const formatter = new Formatter(this.readFormatterOptions(), tokens, haveBody)
        const edits = formatter.format()

        return edits.length > 0 ? edits : undefined
    }

    private async findHaveBody(doc: vscode.TextDocument, exprs: Expr[], haveBody: HaveBody) {
        if (!this.state.backend?.isConnected()) {
            return
        }

        for (const expr of exprs) {
            if (expr instanceof SExpr) {
                const name = expr.getName()
                if (name === undefined) {
                    continue
                }

                const pkg = this.state.backend?.getPkgName(doc, expr.start.line)
                if (pkg === undefined) {
                    continue
                }

                const args = await this.state.backend?.getOpArgs(name, pkg)
                if (this.hasBody(args ?? '')) {
                    haveBody[name] = true
                }

                await this.findHaveBody(doc, expr.parts, haveBody)
            }
        }

        return haveBody
    }

    private hasBody(args: string) {
        const lex = new Lexer(args)
        const tokens = lex.getTokens()
        const parser = new Parser(tokens)
        const exprs = parser.parse()

        if (exprs.length !== 1) {
            return false
        }

        const expr = exprs[0]
        if (!(expr instanceof SExpr)) {
            return false
        }

        for (const part of expr.parts) {
            if (part instanceof Atom && typeof part.value === 'string' && part.value.toUpperCase() === '&BODY') {
                return true
            }
        }

        return false
    }

    private readFormatterOptions(): Options {
        const cfg = vscode.workspace.getConfiguration('alive')
        const defaults: Options = {
            indentWidth: 2,
            closeParenOwnLine: 'never',
            closeParenStacked: 'always',
            indentCloseParenStack: true,
            maxBlankLines: 1,
        }

        if (cfg?.format === undefined) {
            return defaults
        }

        const indentWidth = cfg.format.indentWidth ?? defaults.indentWidth

        const indentCloseParenStack = cfg.format.indentCloseParenStack ?? defaults.indentCloseParenStack
        const closeParenStacked = cfg.format.closeParenStacked ?? defaults.closeParenStacked
        const closeParenOwnLine = cfg.format.closeParenOwnLine ?? defaults.closeParenOwnLine
        const maxBlankLines = cfg.format.maxBlankLines ?? defaults.maxBlankLines

        return {
            indentWidth,
            indentCloseParenStack,
            closeParenStacked,
            closeParenOwnLine,
            maxBlankLines,
        }
    }
}
