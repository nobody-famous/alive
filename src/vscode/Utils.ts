import * as vscode from 'vscode'
import { types, Lexer, Parser, Token } from '../lisp'
import { Colorizer } from './colorize/Colorizer'

const colorizer = new Colorizer()

export const COMMON_LISP_ID = 'common-lisp'
export const REPL_ID = 'common-lisp-repl'

export function toVscodePos(pos: types.Position): vscode.Position {
    return new vscode.Position(pos.line, pos.character)
}

export function isReplDoc(doc: vscode.TextDocument) {
    return doc.languageId === REPL_ID
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

export function jumpToBottom(editor: vscode.TextEditor) {
    const pos = editor.document.positionAt(Infinity)

    editor.selection = new vscode.Selection(pos, pos)
    editor.revealRange(new vscode.Range(pos, pos))
}
