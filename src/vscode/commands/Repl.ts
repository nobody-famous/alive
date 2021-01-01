import { format } from 'util'
import * as vscode from 'vscode'
import { Repl } from '../repl'
import { ExtensionState } from '../Types'
import {
    COMMON_LISP_ID,
    getPkgName,
    getSelectOrExpr,
    REPL_ID,
    strToMarkdown,
    updatePackageNames,
    useEditor,
    useRepl
} from '../Utils'

export async function sendToRepl(state: ExtensionState) {
    useEditor([COMMON_LISP_ID, REPL_ID], (editor: vscode.TextEditor) => {
        useRepl(state, async (repl: Repl) => {
            let text = getSelectOrExpr(editor, editor.selection.start)

            if (text === undefined) {
                return
            }

            const pkgName = getPkgName(editor.document, editor.selection.start.line, state.pkgMgr, repl)

            await repl.send(editor, text, pkgName)

            if (editor.document.languageId === REPL_ID) {
                state.repl?.addHistory(text, pkgName)
            }

            await updatePackageNames(state)
        })
    })
}

export async function inlineEval(state: ExtensionState) {
    useEditor([COMMON_LISP_ID], (editor: vscode.TextEditor) => {
        useRepl(state, async (repl: Repl) => {
            let text = getSelectOrExpr(editor, editor.selection.start)
            const pkgName = getPkgName(editor.document, editor.selection.start.line, state.pkgMgr, repl)

            if (text === undefined) {
                return
            }

            const result = await repl.inlineEval(text, pkgName)

            if (result !== undefined) {
                state.hoverText = strToMarkdown(result)
                vscode.commands.executeCommand('editor.action.showHover')
            }
        })
    })
}

export async function attachRepl(state: ExtensionState, ctx: vscode.ExtensionContext) {
    try {
        const showMsgs = state.repl === undefined

        if (showMsgs) {
            vscode.window.showInformationMessage('Connecting to REPL')
        }

        await newReplConnection(state, ctx)

        if (showMsgs) {
            vscode.window.showInformationMessage('REPL Connected')
        }
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

export async function detachRepl(state: ExtensionState) {
    if (state.repl === undefined) {
        return
    }

    await state.repl.disconnect()
    state.repl = undefined

    vscode.window.showInformationMessage('Disconnected from REPL')
}

export async function replHistory(state: ExtensionState) {
    useRepl(state, async (repl: Repl) => {
        const items = repl.historyItems()
        const qp = vscode.window.createQuickPick()

        qp.items = items.map<vscode.QuickPickItem>((i) => ({ label: i.text, description: i.pkgName }))

        qp.onDidChangeSelection(async (e) => {
            const item = e[0]

            if (item === undefined) {
                return
            }

            const text = item.label
            const pkg = item.description
            const editor = vscode.window.activeTextEditor

            if (editor === undefined) {
                return
            }

            await repl.send(editor, text, pkg ?? ':cl-user')
            repl.addHistory(text, pkg ?? ':cl-user')
        })

        qp.onDidHide(() => qp.dispose())
        qp.show()
    })
}

async function newReplConnection(state: ExtensionState, ctx: vscode.ExtensionContext) {
    if (state.repl === undefined) {
        state.repl = new Repl(ctx, 'localhost', 4005)
        state.repl.on('close', () => (state.repl = undefined))
    }

    await state.repl.connect()
    await updatePackageNames(state)
}
