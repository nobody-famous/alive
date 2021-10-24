import { EOL, homedir } from 'os'
import { format, TextEncoder } from 'util'
import * as fs from 'fs'
import * as vscode from 'vscode'
import { exprToString, SExpr } from '../../lisp'
import { Repl } from '../repl'
import { ExtensionState, SlimeVersion, InstalledSlimeInfo } from '../Types'
import { spawn } from 'child_process'
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
    xlatePath,
} from '../Utils'
import * as net from 'net'
import * as path from 'path'

import axios from 'axios'
import * as StreamZip from 'node-stream-zip'
import { CompileNote } from '../../swank/response/CompileNotes'

const swankOutputChannel = vscode.window.createOutputChannel('Swank Trace')
const compilerDiagnostics = vscode.languages.createDiagnosticCollection('Compiler Diagnostics')

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

function setupFailedStartupWarningTimer() {
    const timeoutInMs = 3000
    const displayWarning = () => {
        vscode.window.showWarningMessage(`REPL attach is taking an unexpectedly long time`)
        swankOutputChannel.show()
    }
    let complete = false;
    let timer = setTimeout(displayWarning, timeoutInMs);

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
        }
    }
}

export async function startReplAndAttach(state: ExtensionState, ctx: vscode.ExtensionContext): Promise<void> {
    const defaultPort = 4005
    try {
        if (!(await portIsAvailable(defaultPort))) {
            vscode.window.showWarningMessage(`Failed to start REPL, port ${defaultPort} is already in use`)
            return
        }
        const installedSlimeInfo = await installAndConfigureSlime(state)
        const cwd = await getWorkspaceOrFilePath()
        const cmd = vscode.workspace.getConfiguration('alive').swank.startupCommand
        const timer = setupFailedStartupWarningTimer()
        const attachToRunningRepl = (out: string) => {
            timer.restart()
            swankOutputChannel.appendLine(out)
            if (out.includes(`Swank started at port: ${defaultPort}`)) {
                timer.cancel()
                attachRepl(state, ctx, { host: 'localhost', port: defaultPort })
            } else if (out.includes('Swank started at port')) {
                timer.cancel()
                attachRepl(state, ctx)
            }
        }
        const handleDisconnect = (state: ExtensionState) => async (_code: number, _signal: string) => {
            if (state.repl === undefined) {
                if (state.child) {
                    await disconnectAndClearChild(state)
                }
            } else {
                await disconnectAndClearChild(state)
            }
        }

        if (state.repl === undefined) {
            if (state.child) {
                timer.cancel()
                vscode.window.showWarningMessage('Previous attempt to attach to REPL is still running.  Detach to try again')
            } else {
                state.child = spawn(cmd[0], cmd.slice(1), { cwd, env: getClSourceRegistryEnv(installedSlimeInfo.path, process.env) })
                state.child.stdout?.setEncoding('utf-8').on('data', attachToRunningRepl)
                state.child.stderr?.setEncoding('utf-8').on('data', attachToRunningRepl)
                state.child
                    .on('exit', handleDisconnect(state))
                    .on('disconnect', handleDisconnect(state))
                    .on('error', (err: Error) => {
                        timer.cancel()
                        vscode.window.showErrorMessage(`Couldn't spawn Swank server: ${err.message}`)
                    })
            }
        } else {
            vscode.window.showWarningMessage('REPL already attached')
        }
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

export async function attachRepl(state: ExtensionState, ctx: vscode.ExtensionContext, hp?: HostPort) {
    try {
        if (state.repl === undefined) {
            const connected = await newReplConnection(state, ctx, hp)
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

    if (state.repl !== undefined) {
        await state.repl.disconnect()
        state.repl = undefined
        vscode.window.showInformationMessage('REPL Detached')
    } else {
        if (childWasKilled) {
            vscode.window.showWarningMessage('Killed hung Swank process')
        } else {
            vscode.window.showWarningMessage('No REPL currently attached')
        }
    }
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

export async function compileAsdfSystem(state: ExtensionState) {
    useRepl(state, async (repl: Repl) => {
        const names = await repl.listAsdfSystems()
        const name = await vscode.window.showQuickPick(names)

        if (typeof name !== 'string') {
            return
        }

        await vscode.workspace.saveAll()
        const resp = await repl.compileAsdfSystem(name)

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
    useRepl(state, async (repl: Repl) => {
        const names = await repl.listAsdfSystems()
        const name = await vscode.window.showQuickPick(names)

        if (typeof name !== 'string') {
            return
        }

        await vscode.workspace.saveAll()
        const resp = await repl.loadAsdfSystem(name)

        if (resp === undefined) {
            return
        }

        if (resp.notes.length === 0) {
            await vscode.window.showInformationMessage(`${name} Loaded successfully`)
        }

        await updateCompilerDiagnostics({}, resp.notes)
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

export async function compileFile(state: ExtensionState, useTemp: boolean, ignoreOutput: boolean = false) {
    useEditor([COMMON_LISP_ID], (editor: vscode.TextEditor) => {
        useRepl(state, async (repl: Repl) => {
            if (state.compileRunning) {
                return
            }

            let setConnFlags = false

            try {
                state.compileRunning = true

                if (!useTemp) {
                    await editor.document.save()
                }

                const toCompile = useTemp ? await createTempFile(editor.document) : editor.document.fileName

                repl.conn?.setIgnoreOutput(ignoreOutput)
                repl.conn?.setIgnoreDebug(ignoreOutput)

                setConnFlags = true

                const resp = await repl.compileFile(toCompile)

                if (resp !== undefined) {
                    const fileMap: { [index: string]: string } = {}

                    fileMap[toCompile] = editor.document.fileName
                    compilerDiagnostics.set(vscode.Uri.file(editor.document.fileName), [])

                    updateCompilerDiagnostics(fileMap, resp.notes)
                }
            } finally {
                state.compileRunning = false

                if (setConnFlags) {
                    repl.conn?.setIgnoreOutput(false)
                    repl.conn?.setIgnoreDebug(false)
                }
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

async function updateCompilerDiagnostics(fileMap: { [index: string]: string }, notes: CompileNote[]) {
    const diags: { [index: string]: vscode.Diagnostic[] } = {}

    for (const note of notes) {
        const notesFile = note.location.file.replace(/\//g, path.sep)
        const fileName = fileMap[notesFile] ?? note.location.file

        const doc = await vscode.workspace.openTextDocument(fileName)
        const pos = doc.positionAt(note.location.position)

        if (diags[fileName] === undefined) {
            diags[fileName] = []
        }

        const diag = new vscode.Diagnostic(new vscode.Range(pos, pos), note.message, convertSeverity(note.severity))
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

async function installAndConfigureSlime(state: ExtensionState): Promise<InstalledSlimeInfo> {
    await fs.promises.mkdir(getSlimeBasePath(state), { recursive: true })

    let version: SlimeVersion | undefined
    if (vscode.workspace.getConfiguration('alive').swank.checkForLatest) {
        version = await getLatestSlimeVersion()
    }

    let name = await getInstalledVersionName(state)
    if (!name) return installSlime(state, version)

    const slimePath = await getSlimePath(state, name)
    if (!slimePath) return installSlime(state, version)

    return { path: slimePath, latest: undefined }
}

async function getLatestSlimeVersion(): Promise<SlimeVersion> {
    // TODO - Handle Github rate limits for > 60 calls/hour
    const out = await axios(vscode.workspace.getConfiguration('alive').swank.downloadUrl, {
        headers: { 'User-Agent': 'nobody-famous/alive' },
        method: 'GET',
    })
    const versions: SlimeVersion[] = out.data
    return versions.sort((f, s) => (f.created_at > s.created_at ? -1 : f.created_at < s.created_at ? 1 : 0))[0]
}

async function installSlime(state: ExtensionState, version: SlimeVersion | undefined): Promise<InstalledSlimeInfo> {
    const latest = version === undefined ? await getLatestSlimeVersion() : version
    const zipPath = path.normalize(path.join(getSlimeBasePath(state), latest.name))
    const zipFile = path.join(zipPath, `${latest.name}.zip`)

    vscode.window.showInformationMessage('Installing Swank server')
    const response = await axios(latest.zipball_url, {
        headers: { 'User-Agent': 'nobody-famous/alive' },
        method: 'GET',
        responseType: 'stream',
    })

    await fs.promises.mkdir(zipPath, { recursive: true })
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(zipFile)
        response.data.pipe(writer).on('finish', resolve).on('close', resolve).on('error', reject)
    })
    const streamZip = new StreamZip.async({ file: zipFile })
    await streamZip.extract(null, zipPath)
    await streamZip.close()

    const slimePath = await getSlimePath(state, latest.name)
    if (!slimePath) {
        throw new Error('Failed to download latest Slime version')
    }

    return { path: slimePath, latest }
}

async function getInstalledVersionName(state: ExtensionState): Promise<string | undefined> {
    const files = await fs.promises.readdir(getSlimeBasePath(state))
    if (files.length !== 1) {
        await fs.promises.rm(getSlimeBasePath(state), { recursive: true })
        return undefined
    }
    return files[0]
}

async function getSlimePath(state: ExtensionState, versionName: string): Promise<string | undefined> {
    const files = await fs.promises.readdir(path.join(getSlimeBasePath(state), versionName))
    if (files.length !== 2) {
        await fs.promises.rm(getSlimeBasePath(state), { recursive: true })
        return undefined
    }
    const zipFileName = `${path.basename(versionName)}.zip`
    const hashDirectory = files.filter((f) => f !== zipFileName)[0]
    return path.join(getSlimeBasePath(state), versionName, hashDirectory)
}

function getClSourceRegistryEnv(
    slimePath: string,
    processEnv: { [key: string]: string | undefined }
): { [key: string]: string | undefined } {
    const updatedEnv = { ...processEnv }
    if (!processEnv.CL_SOURCE_REGISTRY) {
        updatedEnv.CL_SOURCE_REGISTRY = slimePath
        return updatedEnv
    }
    if (processEnv.CL_SOURCE_REGISTRY.startsWith('(')) {
        const slimePathSExpressionEnding = ` (:directory "${slimePath}")`
        updatedEnv.CL_SOURCE_REGISTRY = `${processEnv.CL_SOURCE_REGISTRY.replace(/\)$/, slimePathSExpressionEnding)})`
        return updatedEnv
    }
    updatedEnv.CL_SOURCE_REGISTRY = `${processEnv.CL_SOURCE_REGISTRY}${path.delimiter}${slimePath}`
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

function getSlimeBasePath(state: ExtensionState): string {
    if (state.slimeBasePath === undefined) {
        const extensionMetadata = vscode.extensions.getExtension('rheller.alive')
        if (!extensionMetadata) throw new Error('Failed to find rheller.alive extension config directory')
        state.slimeBasePath = path.normalize(path.join(extensionMetadata.extensionPath, 'out', 'slime'))
    }
    if (state.slimeBasePath === undefined) {
        throw new Error('Failed to set Slime base path')
    }
    return state.slimeBasePath
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
                swankOutputChannel.append(`${msg}${EOL}`)
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
