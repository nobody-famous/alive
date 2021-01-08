import * as vscode from 'vscode'
import { COMMON_LISP_ID, getTopExpr, REPL_ID, toVscodePos, useEditor } from '../Utils'

export async function selectSexpr() {
    await useEditor([COMMON_LISP_ID, REPL_ID], async (editor: vscode.TextEditor) => {
        const expr = getTopExpr(editor.document, editor.selection.start)

        if (expr !== undefined) {
            editor.selection = new vscode.Selection(toVscodePos(expr.start), toVscodePos(expr.end))
        }
    })
}
