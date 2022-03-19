import { spawn } from 'child_process'
import * as net from 'net'
import { homedir } from 'os'
import * as path from 'path'
import { format, TextEncoder } from 'util'
import * as vscode from 'vscode'
import { exprToString, SExpr } from '../../lisp'
import { History } from '../repl'
import { CompileFileNote, ExtensionState, HostPort } from '../Types'
import {
    checkConnected,
    COMMON_LISP_ID,
    createFolder,
    getInnerExprText,
    getSelectOrExpr,
    getTempFolder,
    getTopExpr,
    jumpToTop,
    openFile,
    REPL_ID,
    strToMarkdown,
    useEditor,
} from '../Utils'

const compilerDiagnostics = vscode.languages.createDiagnosticCollection('Compiler Diagnostics')
const backendOutputChannel = vscode.window.createOutputChannel('Alive Backend')
const replHistory: History = new History()

export async function sendToRepl(state: ExtensionState) {
    useEditor([COMMON_LISP_ID, REPL_ID], (editor: vscode.TextEditor) => {
        checkConnected(state, async () => {
            let text = getSelectOrExpr(editor, editor.selection.start)

            if (text === undefined) {
                return
            }

            const pkgName = state.backend?.getPkgName(editor.document, editor.selection.start.line)

            await state.backend?.sendToRepl(editor, text, pkgName ?? '', true)

            if (editor.document.languageId === REPL_ID) {
                replHistory.add(text, pkgName ?? ':cl-user')
            }
        })
    })
}

export async function inlineEval(state: ExtensionState) {
    useEditor([COMMON_LISP_ID], (editor: vscode.TextEditor) => {
        checkConnected(state, async () => {
            let text = getSelectOrExpr(editor, editor.selection.start)
            const pkgName = state.backend?.getPkgName(editor.document, editor.selection.start.line)

            if (text === undefined || pkgName === undefined) {
                return
            }

            const result = await state.backend?.inlineEval(text, pkgName)

            if (result !== undefined) {
                state.hoverText = strToMarkdown(result)
                await vscode.window.showTextDocument(editor.document, editor.viewColumn)
                vscode.commands.executeCommand('editor.action.showHover')
            }
        })
    })
}

function setupFailedStartupWarningTimer() {
    const timeoutInMs = 10000
    const displayWarning = () => {
        vscode.window.showWarningMessage(`REPL attach is taking an unexpectedly long time`)
        backendOutputChannel.show()
    }
    let complete = false
    let timer = setTimeout(displayWarning, timeoutInMs)

    return {
        restart(): void {
            clearTimeout(timer)
            if (!complete) {
                timer = setTimeout(displayWarning, timeoutInMs)
            }
        },
        cancel(): void {
            complete = true
            clearTimeout(timer)
        },
    }
}

export async function startReplAndAttach(state: ExtensionState): Promise<void> {
    if (state.backend === undefined) {
        vscode.window.showErrorMessage('No backend defined, cannot start REPL')
        return
    }

    const defaultPort = state.backend.defaultPort

    try {
        if (!(await portIsAvailable(defaultPort))) {
            vscode.window.showWarningMessage(`Failed to start REPL, port ${defaultPort} is already in use`)
            return
        }

        await state.backend.installServer()

        const cwd = await getWorkspaceOrFilePath()
        const cmd = state.backend?.serverStartupCommand()
        const timer = setupFailedStartupWarningTimer()

        const attachToRunningRepl = (out: string) => {
            timer.restart()
            backendOutputChannel.appendLine(out)
            if (out.includes(`Swank started at port: ${defaultPort}`)) {
                timer.cancel()
                attachRepl(state, { host: 'localhost', port: defaultPort })
            } else if (out.includes('Swank started at port')) {
                timer.cancel()
                attachRepl(state)
            }
        }

        const handleDisconnect = (state: ExtensionState) => async (_code: number, _signal: string) => {
            if (state.backend?.isConnected() || state.child !== undefined) {
                await disconnectAndClearChild(state)
            }
        }

        if (cmd === undefined) {
            vscode.window.showErrorMessage('No command defined, cannot start REPL')
            return
        }

        if (!state.backend?.isConnected()) {
            if (state.child) {
                timer.cancel()
                vscode.window.showWarningMessage('Previous attempt to attach to REPL is still running. Detach to try again')
            } else {
                state.child = spawn(cmd[0], cmd.slice(1), {
                    cwd,
                    env: getClSourceRegistryEnv(state.backend?.serverInstallPath() ?? '', process.env),
                })
                state.child.stdout?.setEncoding('utf-8').on('data', attachToRunningRepl)
                state.child.stderr?.setEncoding('utf-8').on('data', attachToRunningRepl)
                state.child
                    .on('exit', handleDisconnect(state))
                    .on('disconnect', handleDisconnect(state))
                    .on('error', (err: Error) => {
                        timer.cancel()
                        vscode.window.showErrorMessage(`Couldn't spawn server: ${err.message}`)
                    })
            }
        } else {
            vscode.window.showWarningMessage('REPL already attached')
        }
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

export async function attachRepl(state: ExtensionState, hp?: HostPort) {
    try {
        if (!state.backend?.isConnected()) {
            const connected = await newReplConnection(state, hp)
            if (connected) {
                vscode.window.showInformationMessage('REPL Attached')
            }
        } else {
            vscode.window.showWarningMessage('REPL already attached')
        }
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

export async function detachRepl(state: ExtensionState) {
    const childWasKilled = await disconnectAndClearChild(state)

    compilerDiagnostics.clear()

    if (!state.backend?.isConnected()) {
        await state.backend?.disconnect()
        vscode.window.showInformationMessage('REPL Detached')
    } else {
        if (childWasKilled) {
            vscode.window.showWarningMessage('Killed hung Swank process')
        } else {
            vscode.window.showWarningMessage('No REPL currently attached')
        }
    }
}

function selectHistoryItem(state: ExtensionState, cb: (text: string, pkg?: string) => void) {
    checkConnected(state, async () => {
        const items = [...replHistory.list]
        const qp = vscode.window.createQuickPick()

        qp.items = items.reverse().map<vscode.QuickPickItem>((i) => ({ label: i.text, description: i.pkgName }))

        qp.onDidChangeSelection(async (e) => {
            const item = e[0]

            if (item === undefined) {
                return
            }

            cb(item.label, item.description)

            qp.hide()
        })

        qp.onDidHide(() => qp.dispose())
        qp.show()
    })
}

export async function grabReplHistoryItem(state: ExtensionState) {
    selectHistoryItem(state, (text: string) => {
        state.backend?.addToReplView(text)
    })
}

export async function sendReplHistoryItem(state: ExtensionState) {
    selectHistoryItem(state, async (text: string, pkg?: string) => {
        const editor = vscode.window.activeTextEditor

        if (editor === undefined) {
            return
        }

        await vscode.workspace.saveAll()
        await state.backend?.sendToRepl(editor, text, pkg ?? ':cl-user', true)

        if (editor.document.languageId === REPL_ID) {
            replHistory.add(text, pkg ?? ':cl-user')
        }
    })
}

export function debugAbort(state: ExtensionState) {
    if (state.backend?.isConnected()) {
        state.backend?.replDebugAbort()
    }
}

export async function nthRestart(state: ExtensionState, n: unknown) {
    checkConnected(state, async () => {
        if (typeof n !== 'string') {
            return
        }

        const num = Number.parseInt(n)

        if (!Number.isNaN(num)) {
            await state.backend?.replNthRestart(num)
        }
    })
}

export async function macroExpand(state: ExtensionState) {
    useEditor([COMMON_LISP_ID, REPL_ID], (editor: vscode.TextEditor) => {
        checkConnected(state, async () => {
            const text = await getInnerExprText(editor.document, editor.selection.start)
            const pkgName = state.backend?.getPkgName(editor.document, editor.selection.start.line)

            if (text === undefined || pkgName === undefined) {
                return
            }

            const result = await state.backend?.macroExpand(text, pkgName)

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
        checkConnected(state, async () => {
            const text = await getInnerExprText(editor.document, editor.selection.start)
            const pkgName = state.backend?.getPkgName(editor.document, editor.selection.start.line)

            if (text === undefined || pkgName === undefined) {
                return
            }

            const result = await state.backend?.macroExpandAll(text, pkgName)

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
        checkConnected(state, async () => {
            const expr = getTopExpr(editor.document, editor.selection.start)

            if (!(expr instanceof SExpr) || expr.parts.length < 2) {
                return
            }

            const name = exprToString(expr.parts[1])
            const pkgName = state.backend?.getPkgName(editor.document, editor.selection.start.line)

            if (name === undefined || pkgName === undefined) {
                return
            }

            const result = await state.backend?.disassemble(`'${name}`, pkgName)

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

export async function compileAsdfSystem(state: ExtensionState) {
    checkConnected(state, async () => {
        const names = await state.backend?.listAsdfSystems()
        const name = await vscode.window.showQuickPick(names ?? [])

        if (typeof name !== 'string') {
            return
        }

        await vscode.workspace.saveAll()
        const resp = await state.backend?.compileAsdfSystem(name)

        if (resp === undefined) {
            return
        }

        if (resp.notes.length === 0) {
            await vscode.window.showInformationMessage(`${name} Compiled successfully`)
        }

        await updateCompilerDiagnostics({}, resp.notes)
    })
}

export async function loadAsdfSystem(state: ExtensionState) {
    checkConnected(state, async () => {
        const names = await state.backend?.listAsdfSystems()
        const name = await vscode.window.showQuickPick(names ?? [])

        if (typeof name !== 'string') {
            return
        }

        await vscode.workspace.saveAll()
        const resp = await state.backend?.loadAsdfSystem(name)

        if (resp === undefined) {
            return
        }

        await updateCompilerDiagnostics({}, resp.notes)
    })
}

export async function loadFile(state: ExtensionState) {
    useEditor([COMMON_LISP_ID], (editor: vscode.TextEditor) => {
        checkConnected(state, async () => {
            await editor.document.save()
            await state.backend?.loadFile(editor.document.uri.fsPath)
        })
    })
}

export async function compileFile(state: ExtensionState, useTemp: boolean, ignoreOutput: boolean = false) {
    useEditor([COMMON_LISP_ID], (editor: vscode.TextEditor) => {
        checkConnected(state, async () => {
            if (state.compileRunning) {
                return
            }

            try {
                state.compileRunning = true

                if (!useTemp) {
                    await editor.document.save()
                }

                const toCompile = useTemp ? await createTempFile(editor.document) : editor.document.fileName
                const resp = await state.backend?.compileFile(toCompile, ignoreOutput)

                if (resp !== undefined) {
                    const fileMap: { [index: string]: string } = {}

                    fileMap[toCompile] = editor.document.fileName
                    compilerDiagnostics.set(vscode.Uri.file(editor.document.fileName), [])

                    updateCompilerDiagnostics(fileMap, resp.notes)
                }
            } finally {
                state.compileRunning = false
            }
        })
    })
}

async function createTempFile(doc: vscode.TextDocument) {
    const dir = await getTempFolder()
    const faslDir = path.join(dir.fsPath, 'fasl')
    const fileName = path.join(faslDir, 'tmp.lisp')
    const content = new TextEncoder().encode(doc.getText())

    await createFolder(vscode.Uri.file(faslDir))
    await vscode.workspace.fs.writeFile(vscode.Uri.file(fileName), content)

    return fileName
}

function convertSeverity(sev: string): vscode.DiagnosticSeverity {
    switch (sev) {
        case 'error':
        case 'read_error':
            return vscode.DiagnosticSeverity.Error
        case 'note':
        case 'redefinition':
        case 'style_warning':
        case 'warning':
            return vscode.DiagnosticSeverity.Warning
        default:
            return vscode.DiagnosticSeverity.Error
    }
}

async function updateCompilerDiagnostics(fileMap: { [index: string]: string }, notes: CompileFileNote[]) {
    const diags: { [index: string]: vscode.Diagnostic[] } = {}

    for (const note of notes) {
        const notesFile = note.location.file.replace(/\//g, path.sep)
        const fileName = fileMap[notesFile] ?? note.location.file

        const doc = await vscode.workspace.openTextDocument(fileName)
        const startPos = note.location.start
        const endPos = note.location.end

        if (diags[fileName] === undefined) {
            diags[fileName] = []
        }

        const diag = new vscode.Diagnostic(new vscode.Range(startPos, endPos), note.message, convertSeverity(note.severity))
        diags[fileName].push(diag)
    }

    for (const [file, arr] of Object.entries(diags)) {
        compilerDiagnostics.set(vscode.Uri.file(file), arr)
    }
}

async function disconnectAndClearChild(state: ExtensionState): Promise<boolean> {
    if ((state.child?.exitCode !== 0 && state.child?.exitCode !== null) || state.child?.signalCode !== null) {
        state.child = undefined
        return false
    }
    state.child?.kill()
    let killAttempts = 5
    while ((!state.child?.killed || state.child?.signalCode !== null) && killAttempts > 0) {
        await new Promise((r) => setTimeout(r, 1000))
        killAttempts -= 1
    }
    if (!state.child?.killed) {
        vscode.window.showWarningMessage('Failed to kill child process after 5 seconds')
    }
    state.child = undefined
    return true
}

function getClSourceRegistryEnv(installPath: string, processEnv: NodeJS.ProcessEnv): { [key: string]: string | undefined } {
    const updatedEnv = { ...processEnv }

    if (!processEnv.CL_SOURCE_REGISTRY) {
        updatedEnv.CL_SOURCE_REGISTRY = installPath
        return updatedEnv
    }

    if (processEnv.CL_SOURCE_REGISTRY.startsWith('(')) {
        const pathSExpressionEnding = ` (:directory "${installPath}")`
        updatedEnv.CL_SOURCE_REGISTRY = `${processEnv.CL_SOURCE_REGISTRY.replace(/\)$/, pathSExpressionEnding)})`
        return updatedEnv
    }

    updatedEnv.CL_SOURCE_REGISTRY = `${processEnv.CL_SOURCE_REGISTRY}${path.delimiter}${installPath}`
    return updatedEnv
}

async function getWorkspaceOrFilePath(): Promise<string> {
    if (vscode.workspace.workspaceFolders === undefined) {
        return path.dirname(vscode.window.activeTextEditor?.document.fileName || homedir())
    }

    const folder =
        vscode.workspace.workspaceFolders.length > 1
            ? await pickWorkspaceFolder(vscode.workspace.workspaceFolders)
            : vscode.workspace.workspaceFolders[0]

    if (folder === undefined) {
        throw new Error('Failed to find a workspace folder')
    }

    return folder.uri.fsPath
}

async function pickWorkspaceFolder(folders: readonly vscode.WorkspaceFolder[]): Promise<vscode.WorkspaceFolder> {
    const addFolderToFolders = (folders: { [key: string]: vscode.WorkspaceFolder }, folder: vscode.WorkspaceFolder) => {
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

async function newReplConnection(state: ExtensionState, hp?: HostPort): Promise<boolean> {
    let connected = false

    while (!connected) {
        const hostPort = await getHostPort(hp)

        if (hostPort === undefined) {
            return false
        }

        connected = await tryConnect(state, hostPort)
    }

    return true
}

async function getHostPort(hp?: HostPort): Promise<HostPort | undefined> {
    return hp ?? (await promptForHostPort('localhost', 4005))
}

async function tryConnect(state: ExtensionState, hp: HostPort): Promise<boolean> {
    try {
        await state.backend?.connect(hp)

        return true
    } catch (err) {
        vscode.window.showErrorMessage(`Connect failed: ${format(err)}`)
        return false
    }
}

async function promptForHostPort(host: string, port: number): Promise<HostPort | undefined> {
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

/**
 * Checks if port is available by trying to connect to it.  This is done
 * to handle servers that aren't using SO_REUSEADDR.  The side effect of
 * this check is that if the thing running on the port is a Swank server
 * started without the `:dont-close t` setting, it will close the Swank
 * server when it checks it.
 */
async function portIsAvailable(port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket()
        const timeout = () => {
            socket.destroy()
            resolve(false)
        }
        setTimeout(timeout, 200)
        socket
            .on('timeout', timeout)
            .on('connect', () => resolve(false))
            .on('error', (err: { message: string; code?: string }) => {
                if (err.code === 'ECONNREFUSED') {
                    return resolve(true)
                }
                return reject(err)
            })
        socket.connect(port, '0.0.0.0')
    })
}
