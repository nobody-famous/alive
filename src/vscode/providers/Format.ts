import * as vscode from 'vscode'
import { Lexer } from '../../lisp'
import { Formatter, Options } from '../format/Formatter'
import { getTopExpr, toVscodePos } from '../Utils'

export function getDocumentFormatter(): vscode.DocumentFormattingEditProvider {
    return new Provider()
}

export function getDocumentRangeFormatter(): vscode.DocumentRangeFormattingEditProvider {
    return new RangeProvider()
}

class Provider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(doc: vscode.TextDocument, opts: vscode.FormattingOptions) {
        const lex = new Lexer(doc.getText())
        const tokens = lex.getTokens()
        const formatter = new Formatter(
            this.readFormatterOptions(),
            tokens,
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0))
        )
        const edits = formatter.format()

        return edits.length > 0 ? edits : undefined
    }

    protected readFormatterOptions(): Options {
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
}


class RangeProvider extends Provider implements vscode.DocumentRangeFormattingEditProvider {
    provideDocumentRangeFormattingEdits(
        doc: vscode.TextDocument,
        range: vscode.Range,
        opts: vscode.FormattingOptions,
        token: vscode.CancellationToken) {

        if (!vscode.window.activeTextEditor) {
            return
        }

        const expr = getTopExpr(vscode.window.activeTextEditor.document, vscode.window.activeTextEditor.selection.start)

        if (!expr) {
            this.provideDocumentFormattingEdits(doc, opts)
            return
        }

        const start = new vscode.Position(expr.start.line, expr.start.character)
        const end = new vscode.Position(expr.end.line, expr.end.character)
        range = new vscode.Range(start, end)
        const lex = new Lexer(doc.getText(range), range.start)
        lex.start = range.start
        const tokens = lex.getTokens()
        const formatter = new Formatter(this.readFormatterOptions(), tokens, range)
        const edits = formatter.format()

        return edits.length > 0 ? edits : undefined
    }
}
