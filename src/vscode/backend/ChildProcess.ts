import * as vscode from 'vscode'
import * as path from 'path'
import { spawn } from 'child_process'
import { homedir } from 'os'
import { ExtensionState } from '../Types'
import { getWorkspaceOrFilePath } from '../Utils'

const lspOutputChannel = vscode.window.createOutputChannel('Alive LSP')

export async function startLspServer(state: ExtensionState): Promise<number> {
    return new Promise(async (resolve, reject) => {
        const lspConfig = vscode.workspace.getConfiguration('alive.lsp')
        const installPath = lspConfig.get('install.path')
        const cmd = lspConfig.get('startCommand')
        const env = typeof installPath === 'string' ? getClSourceRegistryEnv(installPath, process.env) : process.env
        const cwd = await getWorkspaceOrFilePath()

        if (!Array.isArray(cmd)) {
            return reject('No command defined, cannot start LSP server')
        }

        const handleDisconnect = (state: ExtensionState) => async (_code: number, _signal: string) => {
            if (state.child !== undefined) {
                await disconnectAndClearChild(state)
            }
        }

        const timer = setupFailedStartupWarningTimer()

        const appendOutputData = (data: unknown) => {
            lspOutputChannel.append(`${data}`)
        }

        let connected = false

        state.child = spawn(cmd[0], cmd.slice(1), { cwd, env })

        state.child.stdout?.setEncoding('utf-8').on('data', (data) => {
            appendOutputData(data)

            if (typeof data !== 'string' || connected) {
                return
            }

            const match = data.match(/\[(.*?)\]\[(.*?)\] Started on port (\d+)/)
            const port = parseInt(match?.[3] ?? '')

            if (!Number.isFinite(port) || match === null) {
                return
            }

            timer.cancel()
            connected = true
            resolve(port)
        })

        state.child.stderr?.setEncoding('utf-8').on('data', (data) => appendOutputData(data))

        state.child
            .on('exit', handleDisconnect(state))
            .on('disconnect', handleDisconnect(state))
            .on('error', (err: Error) => {
                timer.cancel()
                reject(`Couldn't spawn server: ${err.message}`)
            })
    })
}

function setupFailedStartupWarningTimer() {
    const timeoutInMs = 10000
    const displayWarning = () => {
        vscode.window.showWarningMessage(`LSP start is taking an unexpectedly long time`)
        lspOutputChannel.show()
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
