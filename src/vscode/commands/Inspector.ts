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
            pkgName = state.backend?.getPkgName(editor.document, pos.line) ?? pkgName

            text = getInspectText(editor, pos)
        }

        const input = await vscode.window.showInputBox({ placeHolder: 'Enter form', value: text })

        text = input !== undefined ? input : ''

        if (text.trim() !== '') {
            await state.backend?.inspector(text, pkgName)
        }
    })
}

export async function inspectorPrev(state: ExtensionState) {
    checkConnected(state, async () => {
        await state.backend?.inspectorPrev()
    })
}

export async function inspectorNext(state: ExtensionState) {
    checkConnected(state, async () => {
        await state.backend?.inspectorNext()
    })
}

export async function inspectorRefresh(state: ExtensionState) {
    checkConnected(state, async () => {
        await state.backend?.inspectorRefresh()
    })
}

export async function inspectorQuit(state: ExtensionState) {
    checkConnected(state, async () => {
        await state.backend?.inspectorQuit()
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
