import * as vscode from 'vscode'
import * as net from 'net'
import * as path from 'path'
import { spawn } from 'child_process'
import { homedir } from 'os'
import { ExtensionState } from '../Types'

export async function startLspServer(state: ExtensionState): Promise<void> {
    return new Promise(async (resolve, reject) => {
        if (state.backend === undefined) {
            return reject('No backend defined')
        }

        const lspConfig = vscode.workspace.getConfiguration('alive.lsp')
        const installPath = lspConfig.get('install.path')
        const cmd = lspConfig.get('startCommand')
        const env = typeof installPath === 'string' ? getClSourceRegistryEnv(installPath, process.env) : process.env
        const cwd = await getWorkspaceOrFilePath()

        if (!Array.isArray(cmd)) {
            return reject('No command defined, cannot start LSP server')
        }

        const handleDisconnect = (state: ExtensionState) => async (_code: number, _signal: string) => {
            if (state.backend?.isConnected() || state.child !== undefined) {
                await disconnectAndClearChild(state)
            }
        }

        const timer = setupFailedStartupWarningTimer()

        state.child = spawn(cmd[0], cmd.slice(1), { cwd, env })
        state.child.stdout?.setEncoding('utf-8').on('data', (data) => console.log(`STDOUT: ${data}`))
        state.child.stderr?.setEncoding('utf-8').on('data', (data) => console.log(`STDERR: ${data}`))
        state.child
            .on('exit', handleDisconnect(state))
            .on('disconnect', handleDisconnect(state))
            .on('error', (err: Error) => {
                timer.cancel()
                reject(`Couldn't spawn server: ${err.message}`)
            })

        const tryConnect = async () => {
            const socket = new net.Socket()

            socket.connect(25483, '', () => {
                socket.end()
                timer.cancel()

                resolve()
            })

            socket.on('error', (err) => {
                setTimeout(() => tryConnect(), 500)
            })
        }

        tryConnect()
    })
}

function setupFailedStartupWarningTimer() {
    const timeoutInMs = 10000
    const displayWarning = () => {
        vscode.window.showWarningMessage(`LSP start is taking an unexpectedly long time`)
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
