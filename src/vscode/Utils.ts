import * as vscode from 'vscode'
import { types, Lexer, Parser } from '../lisp'

export function toVscodePos(pos: types.Position): vscode.Position {
    return new vscode.Position(pos.line, pos.character)
}

export function getDocumentExprs(doc: vscode.TextDocument) {
    const lex = new Lexer(doc.getText())
    const tokens = lex.getTokens()
    const parser = new Parser(tokens)
    const exprs = parser.parse()

    // pkgMgr.update(exprs)

    return exprs
}
