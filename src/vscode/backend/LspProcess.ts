import { ChildProcess, spawn } from 'child_process'
import * as path from 'path'
import * as vscode from 'vscode'
import { isString } from '../Guards'
import { log, toLog } from '../Log'
import { AliveLspVersion, ExtensionState } from '../Types'
import { getLspBasePath } from '../Utils'
import { getInstalledVersion, getLatestVersion, nukeInstalledVersion, pullLatestVersion } from './LspUtils'
import { getUnzippedPath } from './ZipUtils'

const lspOutputChannel = vscode.window.createOutputChannel('Alive LSP')

export async function startLspServer(state: ExtensionState): Promise<number | null> {
    const startChild = (cmd: unknown[], child: ChildProcess) => {
        return new Promise<number>((resolve, reject) => {
            const handleDisconnect = (state: ExtensionState) => async (code: number, signal: string) => {
                log(`Disconnected: CODE ${toLog(code)} SIGNAL ${toLog(signal)}`)

                if (state.child !== undefined) {
                    await disconnectAndClearChild(state)
                }
            }

            const timer = setupFailedStartupWarningTimer()

            const appendOutputData = (data: unknown) => {
                lspOutputChannel.append(`${data}`)
            }

            let connected = false

            child.stdout?.setEncoding('utf-8').on('data', (data) => {
                appendOutputData(data)

                if (typeof data !== 'string' || connected) {
                    return
                }

                log(`Check for port: ${data}`)

                const match = data.match(/\[(.*?)\]\[(.*?)\] Started on port (\d+)/)

                log(`Match: ${toLog(match)}`)

                const port = parseInt(match?.[3] ?? '')

                if (!Number.isFinite(port) || match === null) {
                    log(`Invalid port: ${toLog(port)}`)
                    return
                }

                timer.cancel()
                connected = true

                log(`Found port: ${toLog(port)}`)

                resolve(port)
            })

            child.stderr?.setEncoding('utf-8').on('data', (data) => {
                log(`${toLog(cmd[0])} ERROR: ${toLog(data)}`)

                appendOutputData(data)
            })

            child
                .on('exit', handleDisconnect(state))
                .on('disconnect', handleDisconnect(state))
                .on('error', (err: Error) => {
                    log(`Failed to spawn ${toLog(cmd[0])}: ${toLog(err)}`)

                    timer.cancel()
                    reject(`Couldn't spawn server: ${err.message}`)
                })
        })
    }

    log('Start LSP server')

    try {
        if (typeof state.lspInstallPath !== 'string') {
            log(`Invalid install path: ${toLog(state.lspInstallPath)}`)
            throw new Error('No LSP server install path')
        }

        const lspConfig = vscode.workspace.getConfiguration('alive.lsp')

        log(`LSP config: ${toLog(lspConfig)}`)

        const cmd = lspConfig.get('startCommand')

        log(`Command: ${toLog(cmd)}`)

        const env = getClSourceRegistryEnv(state.lspInstallPath, process.env)

        log(`ENV: ${toLog(env)}`)

        const cwd = state.workspacePath

        log(`CWD: ${toLog(cwd)}`)

        if (!Array.isArray(cmd)) {
            log(`Invalid command: ${toLog(cmd)}`)
            throw new Error('No command defined, cannot start LSP server')
        }

        log(`Spawning child: ${toLog(cmd[0])}`)

        state.child = spawn(cmd[0], cmd.slice(1), { cwd, env })

        log(`Spawned: ${toLog(cmd[0])}`)

        return await startChild(cmd, state.child)
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to start LSP server: ${err}`)
        return null
    }
}

export function getInstallPath(): string | undefined {
    log('Get LSP server install path')

    const config = vscode.workspace.getConfiguration('alive.lsp')

    log(`LSP config: ${toLog(config)}`)

    const cfgInstallPath = config.get('install.path')

    log(`Config install path: ${toLog(cfgInstallPath)}`)

    return isString(cfgInstallPath) && cfgInstallPath !== '' ? cfgInstallPath : undefined
}

export async function downloadLspServer(
    extension: Pick<vscode.Extension<unknown>, 'extensionPath'>,
    url: string
): Promise<string | undefined> {
    try {
        log('Download LSP server')

        const basePath = getLspBasePath(extension)

        log(`Base path: ${toLog(basePath)}`)

        const latestVersion = await getLatestVersion(url)

        log(`Latest version: ${toLog(latestVersion)}`)

        const installedVersion = await getInstalledVersion(basePath)

        log(`Installed version: ${toLog(installedVersion)}`)

        if (installedVersion === undefined) {
            if (latestVersion === undefined) {
                throw new Error('Could not find latest LSP server version')
            }

            return await downloadLatestVersion(basePath, latestVersion)
        } else if (latestVersion === undefined) {
            return getUnzippedPath(path.join(basePath, installedVersion))
        } else if (installedVersion !== latestVersion.tagName) {
            await nukeInstalledVersion(basePath)

            return await downloadLatestVersion(basePath, latestVersion)
        } else {
            return getUnzippedPath(path.join(basePath, installedVersion))
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to download LSP server: ${err}`)
        return undefined
    }
}

async function downloadLatestVersion(basePath: string, latestVersion: AliveLspVersion) {
    try {
        vscode.window.showInformationMessage('Installing LSP server')

        const path = await pullLatestVersion(basePath, latestVersion.tagName, latestVersion.zipballUrl)

        vscode.window.showInformationMessage('Done installing LSP server')

        return path
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to download latest LSP server: ${err}`)
    }
}

function setupFailedStartupWarningTimer() {
    const timeoutInMs = 10000
    const displayWarning = () => {
        vscode.window.showWarningMessage('LSP start is taking an unexpectedly long time')
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
        log('Child exited')
        state.child = undefined
        return false
    }

    log('Killing child')

    state.child?.kill()

    let killAttempts = 5

    while ((!state.child?.killed || state.child?.signalCode !== null) && killAttempts > 0) {
        log(`Kill attempts remaining ${toLog(killAttempts)}`)
        await new Promise((r) => setTimeout(r, 1000))
        killAttempts -= 1
    }

    if (!state.child?.killed) {
        vscode.window.showWarningMessage('Failed to kill child process after 5 seconds')
    }

    log('Killed child')

    state.child = undefined

    return true
}

function getClSourceRegistryEnv(installPath: string, processEnv: NodeJS.ProcessEnv): { [key: string]: string | undefined } {
    const updatedEnv = { ...processEnv }

    if (!processEnv.CL_SOURCE_REGISTRY) {
        updatedEnv.CL_SOURCE_REGISTRY = installPath + path.delimiter
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
