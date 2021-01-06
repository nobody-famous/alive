import { format, TextEncoder } from 'util'
import * as vscode from 'vscode'
import { exprToString, SExpr } from '../../lisp'
import { Repl } from '../repl'
import { ExtensionState } from '../Types'
import {
    COMMON_LISP_ID,
    createFolder,
    getInnerExprText,
    getPkgName,
    getSelectOrExpr,
    getTempFolder,
    getTopExpr,
    jumpToTop,
    openFile,
    REPL_ID,
    strToMarkdown,
    updatePackageNames,
    useEditor,
    useRepl,
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

        qp.items = items.reverse().map<vscode.QuickPickItem>((i) => ({ label: i.text, description: i.pkgName }))

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

            await vscode.workspace.saveAll()
            await repl.send(editor, text, pkg ?? ':cl-user')

            repl.addHistory(text, pkg ?? ':cl-user')
        })

        qp.onDidHide(() => qp.dispose())
        qp.show()
    })
}

export function debugAbort(state: ExtensionState) {
    if (state.repl !== undefined) {
        state.repl.abort()
    }
}

export async function nthRestart(state: ExtensionState, n: unknown) {
    useRepl(state, async (repl: Repl) => {
        if (typeof n !== 'string') {
            return
        }

        const num = Number.parseInt(n)

        if (!Number.isNaN(num)) {
            await repl.nthRestart(num)
            await updatePackageNames(state)
        }
    })
}

export async function macroExpand(state: ExtensionState) {
    useEditor([COMMON_LISP_ID, REPL_ID], (editor: vscode.TextEditor) => {
        useRepl(state, async (repl: Repl) => {
            const text = await getInnerExprText(editor.document, editor.selection.start)

            if (text === undefined) {
                return
            }

            const pkgName = getPkgName(editor.document, editor.selection.start.line, state.pkgMgr, repl)
            const result = await repl.macroExpand(text, pkgName)

            if (result === undefined) {
                return
            }

            state.hoverText = strToMarkdown(result)
            vscode.commands.executeCommand('editor.action.showHover')
        })
    })
}

export async function macroExpandAll(state: ExtensionState) {
    useEditor([COMMON_LISP_ID, REPL_ID], (editor: vscode.TextEditor) => {
        useRepl(state, async (repl: Repl) => {
            const text = await getInnerExprText(editor.document, editor.selection.start)

            if (text === undefined) {
                return
            }

            const pkgName = getPkgName(editor.document, editor.selection.start.line, state.pkgMgr, repl)
            const result = await repl.macroExpandAll(text, pkgName)

            if (result === undefined) {
                return
            }

            state.hoverText = strToMarkdown(result)
            vscode.commands.executeCommand('editor.action.showHover')
        })
    })
}

export async function disassemble(state: ExtensionState) {
    useEditor([COMMON_LISP_ID, REPL_ID], (editor: vscode.TextEditor) => {
        useRepl(state, async (repl: Repl) => {
            const expr = getTopExpr(editor.document, editor.selection.start)

            if (!(expr instanceof SExpr) || expr.parts.length < 2) {
                return
            }

            const name = exprToString(expr.parts[1])

            if (name === undefined) {
                return
            }

            const pkgName = getPkgName(editor.document, editor.selection.start.line, state.pkgMgr, repl)
            const result = await repl.disassemble(`'${name}`, pkgName)

            if (result === undefined) {
                return
            }

            const file = await writeDisassemble(result)

            if (file !== undefined) {
                const editor = await vscode.window.showTextDocument(file, vscode.ViewColumn.Two, true)
                jumpToTop(editor)
            }
        })
    })
}

export async function loadFile(state: ExtensionState) {
    useEditor([COMMON_LISP_ID], (editor: vscode.TextEditor) => {
        useRepl(state, async (repl: Repl) => {
            await editor.document.save()
            await repl.loadFile(editor.document.uri.fsPath)
            await updatePackageNames(state)
        })
    })
}

async function writeDisassemble(text: string) {
    const folder = await getTempFolder()

    if (folder === undefined) {
        vscode.window.showErrorMessage('No folder for disassemble output')
        return
    }

    await createFolder(folder)

    const filePath = vscode.Uri.joinPath(folder, 'disassemble.lisp')
    const file = await openFile(filePath)
    const content = new TextEncoder().encode(text)

    await vscode.workspace.fs.writeFile(file.uri, content)

    return file
}

async function newReplConnection(state: ExtensionState, ctx: vscode.ExtensionContext) {
    if (state.repl === undefined) {
        state.repl = new Repl(ctx, 'localhost', 4005)
        state.repl.on('close', () => (state.repl = undefined))
    }

    await connectWithQuery(state.repl)
    // try {
    //     await state.repl.connect()
    // } catch (err) {
    //     console.log('Connect failed')
    // }

    await updatePackageNames(state)
}

async function connectWithQuery(repl: Repl) {
    try {
        await repl.connect()
    } catch (err) {
        const input = await vscode.window.showInputBox({ value: 'localhost:4005', prompt: 'Host and port' })
        console.log('input', input)
    }
}
