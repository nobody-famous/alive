import * as vscode from 'vscode'
import { getDocumentRangeFormatter } from '.'
import { Lexer } from '../../lisp/Lexer'
import { Formatter } from '../format/Formatter'
import { Options } from '../format/Utils'
import { getInnerExpr, getTopExpr } from '../Utils'
import { getDocumentFormatter } from './Format'

export class GoOnTypingFormatter implements vscode.OnTypeFormattingEditProvider {
    private readFormatterOptions(): Options {
        const cfg = vscode.workspace.getConfiguration('alive')
        const defaults: Options = {
            indentWidth: 2,
            closeParenOwnLine: 'never',
            closeParenStacked: 'always',
            indentCloseParenStack: true,
        }

        if (cfg?.format === undefined) {
            return defaults
        }

        const indentWidth = cfg.format.indentWidth ?? defaults.indentWidth

        const indentCloseParenStack = cfg.format.indentCloseParenStack ?? defaults.indentCloseParenStack
        const closeParenStacked = cfg.format.closeParenStacked ?? defaults.closeParenStacked
        const closeParenOwnLine = cfg.format.closeParenOwnLine ?? defaults.closeParenOwnLine

        return {
            indentWidth,
            indentCloseParenStack,
            closeParenStacked,
            closeParenOwnLine,
        }
    }

    public provideOnTypeFormattingEdits(
        document: vscode.TextDocument, position: vscode.Position,
        ch: string, options: vscode.FormattingOptions, token: vscode.CancellationToken):
        Thenable<vscode.TextEdit[]> {

        const expr = getInnerExpr(vscode.window.activeTextEditor!.document, vscode.window.activeTextEditor!.selection.start)
        if (!expr) {
            return Promise.reject('No expression found')
        }

        const range = new vscode.Range(
            new vscode.Position(expr.start.line, expr.start.character),
            new vscode.Position(expr.end.line, expr.end.character)
        )
        const lex = new Lexer(document.getText(range), range.start)
        const tokens = lex.getTokens()
        const formatter = new Formatter(this.readFormatterOptions(), tokens, range)
        const edits = formatter.format()

        return Promise.resolve(edits)
    }
}
