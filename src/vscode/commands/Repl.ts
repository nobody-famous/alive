import { EOL, homedir } from 'os'
import { format, TextEncoder } from 'util'
import * as vscode from 'vscode'
import { exprToString, SExpr } from '../../lisp'
import { Repl } from '../repl'
import { ExtensionState } from '../Types'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
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
import path = require('path')

const outputChannel = vscode.window.createOutputChannel("Alive Swank REPL")
let child: ChildProcessWithoutNullStreams | undefined;
let swankOutputChannel: vscode.OutputChannel | undefined = undefined;

export async function sendToRepl(state: ExtensionState) {
    useEditor([COMMON_LISP_ID, REPL_ID], (editor: vscode.TextEditor) => {
        useRepl(state, async (repl: Repl) => {
            let text = getSelectOrExpr(editor, editor.selection.start)

            if (text === undefined) {
                return
            }

            const pkgName = getPkgName(editor.document, editor.selection.start.line, state.pkgMgr, repl)

            await repl.send(editor, text, pkgName, false)

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
                await vscode.window.showTextDocument(editor.document, editor.viewColumn)
                vscode.commands.executeCommand('editor.action.showHover')
            }
        })
    })
}

export async function startReplAndAttach(state: ExtensionState, ctx: vscode.ExtensionContext) {
    try {
        const cwd = (await getWorkspaceOrFilePath())
        const cmd = vscode.workspace.getConfiguration('alive').swank.startupCommand
        const attachToRunningRepl = (out: string) => {
            outputChannel.appendLine(out)
            if (out.includes("Swank started at port: 4005")) {
                attachRepl(state, ctx, { host: 'localhost', port: 4005 })
            } else if (out.includes("Swank started at port")) {
                attachRepl(state, ctx)
            }
        }

        child?.kill()
        child = undefined
        child = spawn(cmd[0], cmd.slice(1), { cwd })
        child.stdout.setEncoding('utf-8')
        child.stderr.setEncoding('utf-8');
        child.stdout.on('data', (out: string) => attachToRunningRepl(out))
        child.stderr.on('data', (out: string) => attachToRunningRepl(out))

        child.on('error', (err: Error) => {
            vscode.window.showErrorMessage(`Couldn't spawn Swank server: ${err.message}`)
        })
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

export async function attachRepl(state: ExtensionState, ctx: vscode.ExtensionContext, hp?: HostPort) {
    try {
        const showMsgs = state.repl === undefined
        const connected = await newReplConnection(state, ctx, hp)

        if (showMsgs && connected) {
            vscode.window.showInformationMessage('REPL Connected')
        }
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

export async function detachRepl(state: ExtensionState) {
    child?.kill()

    if (state.repl !== undefined) {
        await state.repl.disconnect()
        state.repl = undefined
    }

    vscode.window.showInformationMessage('Disconnected from REPL')
}

export async function replHistory(state: ExtensionState, doNotEval: boolean) {
    useRepl(state, async (repl: Repl) => {
        const items = [...repl.historyItems()]
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

            qp.hide()

            await vscode.workspace.saveAll()
            await repl.send(editor, text, pkg ?? ':cl-user', doNotEval)

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

async function getWorkspaceOrFilePath(): Promise<string> {
    if (vscode.workspace.workspaceFolders === undefined) {
        return path.dirname(vscode.window.activeTextEditor?.document.fileName || homedir())
    }

    const folder = vscode.workspace.workspaceFolders.length > 1
        ? await pickWorkspaceFolder(vscode.workspace.workspaceFolders)
        : vscode.workspace.workspaceFolders[0]

    if (folder === undefined) {
        throw new Error('Failed to find a workspace folder')
    }

    return folder.uri.path
}

async function pickWorkspaceFolder(
    folders: readonly vscode.WorkspaceFolder[]
): Promise<vscode.WorkspaceFolder> {
    const addFolderToFolders = (
        folders: { [key: string]: vscode.WorkspaceFolder },
        folder: vscode.WorkspaceFolder
    ) => {
        folders[folder.uri.fsPath] = folder
        return folders
    }
    const namedFolders = folders.reduce(addFolderToFolders, {})
    const folderNames = Object.keys(namedFolders)
    const chosenFolder = await vscode.window.showQuickPick(folderNames, { placeHolder: 'Select folder' })
    if (chosenFolder === undefined) {
        throw new Error('Failed to choose a folder name')
    }

    return namedFolders[chosenFolder]
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

async function newReplConnection(state: ExtensionState, ctx: vscode.ExtensionContext, hp?: HostPort): Promise<boolean> {
    const connected = await tryConnect(state, ctx, hp)

    if (connected) {
        await updatePackageNames(state)
    }

    return connected
}

interface HostPort {
    host: string
    port: number
}

async function tryConnect(state: ExtensionState, ctx: vscode.ExtensionContext, hp?: HostPort): Promise<boolean> {
    let hostPort: HostPort | undefined = { host: 'localhost', port: 4005 }

    try {
        const host = hp?.host ?? 'localhost'
        const port = hp?.port ?? 4005

        if (!hp) {
            hostPort = await promptForHostPort(host, port)
        }

        if (hostPort === undefined) {
            return false
        }

        if (state.repl === undefined) {
            state.repl = new Repl(ctx)
            state.repl.on('close', () => {
                state.repl = undefined
            })
            state.repl.on('swank-trace', (msg) => {
                if (swankOutputChannel === undefined) {
                    swankOutputChannel = vscode.window.createOutputChannel('Swank Trace');
                }

                swankOutputChannel.append(`${msg}${EOL}`);
            })
        }

        await state.repl.connect(hostPort.host, hostPort.port)
    } catch (err) {
        vscode.window.showErrorMessage(`Connect failed: ${format(err)}`)
        return state.repl === undefined ? false : await tryConnect(state, ctx, hostPort)
    }

    return true
}

async function promptForHostPort(host: string, port: number): Promise<{ host: string; port: number } | undefined> {
    const input = await vscode.window.showInputBox({ value: `${host}:${port}`, prompt: 'Host and port' })

    if (input === undefined) {
        return undefined
    }

    return splitHostPort(input)
}

function splitHostPort(input: string): { host: string; port: number } {
    const ndx = input.indexOf(':')
    const hostStr = ndx >= 0 ? input.substring(0, ndx) : input
    const portStr = ndx >= 0 ? input.substring(ndx + 1) : ''
    const portInt = Number.parseInt(portStr)
    const port = Number.isNaN(portInt) ? 4005 : portInt

    return {
        host: hostStr,
        port: port,
    }
}
