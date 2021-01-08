import * as vscode from 'vscode'
import { Lexer } from '../../lisp'
import { Formatter, Options } from '../format/Formatter'

export function getDocumentFormatter(): vscode.DocumentFormattingEditProvider {
    return new Provider()
}

class Provider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(doc: vscode.TextDocument, opts: vscode.FormattingOptions) {
        const lex = new Lexer(doc.getText())
        const tokens = lex.getTokens()
        const formatter = new Formatter(this.readFormatterOptions(), tokens)
        const edits = formatter.format()

        return edits.length > 0 ? edits : undefined
    }

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
}
