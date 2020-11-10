import * as vscode from 'vscode'
import { types, Lexer, Parser, Token } from '../lisp'
import { Colorizer } from './colorize/Colorizer'

const colorizer = new Colorizer()

export function toVscodePos(pos: types.Position): vscode.Position {
    return new vscode.Position(pos.line, pos.character)
}

export function getDocumentExprs(doc: vscode.TextDocument) {
    const lex = new Lexer(doc.getText())
    const tokens = lex.getTokens()
    const parser = new Parser(tokens)
    const exprs = parser.parse()

    return exprs
}

export function decorateText(editor: vscode.TextEditor | undefined, tokens: Token[]) {
    try {
        if (editor !== undefined) {
            colorizer.run(editor, tokens)
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to colorize file: ${err.toString()}`)
    }
}
