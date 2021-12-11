import * as vscode from 'vscode'
import { exprToString, findAtom } from '../../lisp'
import { ExtensionState } from '../Types'
import { checkConnected, getDocumentExprs, REPL_ID } from '../Utils'

export async function inspector(state: ExtensionState) {
    checkConnected(state, async () => {
        const editor = vscode.window.activeTextEditor
        let text = ''
        let pkgName = ':cl-user'

        if (editor !== undefined) {
            const pos = editor.selection.start
            const pkg = state.backend?.getPkgName(editor.document, pos.line)

            text = getInspectText(editor, pos)

            if (editor.document.languageId === REPL_ID) {
                pkgName = repl.curPackage
            } else if (pkg !== undefined) {
                pkgName = pkg
            }
        }

        const input = await vscode.window.showInputBox({ placeHolder: 'Enter form', value: text })

        text = input !== undefined ? input : ''

        if (text.trim() !== '') {
            await repl.inspector(text, pkgName)
        }
    })
}

export async function inspectorPrev(state: ExtensionState) {
    checkConnected(state, async () => {
        await repl.inspectorPrev()
    })
}

export async function inspectorNext(state: ExtensionState) {
    checkConnected(state, async () => {
        await repl.inspectorNext()
    })
}

export async function inspectorRefresh(state: ExtensionState) {
    checkConnected(state, async () => {
        await repl.inspectorRefresh()
    })
}

export async function inspectorQuit(state: ExtensionState) {
    checkConnected(state, async () => {
        await repl.inspectorQuit()
    })
}

function getInspectText(editor: vscode.TextEditor, pos: vscode.Position) {
    if (!editor.selection.isEmpty) {
        return editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end))
    }

    const exprs = getDocumentExprs(editor.document)
    const atom = findAtom(exprs, pos)

    if (atom !== undefined) {
        const str = exprToString(atom)

        return typeof str === 'string' ? str : ''
    }

    return ''
}
