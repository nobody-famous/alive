import { spawn } from 'child_process'
import * as path from 'path'
import * as vscode from 'vscode'
import { isString } from '../Guards'
import { log, toLog } from '../Log'
import { AliveLspVersion, ExtensionState } from '../Types'
import { getLspBasePath } from '../Utils'
import { getInstalledVersion, getLatestVersion, nukeInstalledVersion, pullLatestVersion } from './LspUtils'
import { getClSourceRegistryEnv, startWarningTimer, waitForPort } from './ProcUtils'
import { getUnzippedPath } from './ZipUtils'

const lspOutputChannel = vscode.window.createOutputChannel('Alive LSP')

export async function startLspServer(state: ExtensionState, command: string[]): Promise<number | null> {
    try {
        log('Start LSP server')

        const handleDisconnect = (state: ExtensionState) => async (code: number, signal: string) => {
            log(`Disconnected: CODE ${toLog(code)} SIGNAL ${toLog(signal)}`)

            if (state.child !== undefined) {
                await disconnectAndClearChild(state)
            }
        }

        const handleError = (cmdName: string, err: Error) => {
            log(`${toLog(cmdName)} ERROR: ${toLog(err)}`)
        }

        const appendOutputData = (data: unknown) => {
            lspOutputChannel.append(`${data}`)
        }

        const handleErrData = (cmdName: string, data: unknown) => {
            log(`${toLog(cmdName)} ERROR: ${toLog(data)}`)

            appendOutputData(data)
        }

        const handleOutData = (data: unknown) => {
            appendOutputData(data)
        }

        if (!isString(state.lspInstallPath)) {
            log(`Invalid install path: ${toLog(state.lspInstallPath)}`)
            throw new Error('No LSP server install path')
        }

        const spawnOpts = {
            env: getClSourceRegistryEnv(state.lspInstallPath, process.env),
            cwd: state.workspacePath,
        }

        log(`ENV: ${toLog(spawnOpts.env)}`)
        log(`CWD: ${toLog(spawnOpts.cwd)}`)
        log(`Spawning child: ${toLog(command[0])}`)

        state.child = spawn(command[0], command.slice(1), spawnOpts)

        log(`Spawned: ${toLog(command[0])}`)

        const timer = startWarningTimer(() => {
            vscode.window.showWarningMessage('LSP start is taking an unexpectedly long time')
            lspOutputChannel.show()
        }, 10000)

        try {
            return await waitForPort({
                child: state.child,
                onDisconnect: handleDisconnect(state),
                onError: (err: Error) => handleError(command[0], err),
                onErrData: (data: unknown) => handleErrData(command[0], data),
                onOutData: handleOutData,
            })
        } finally {
            timer?.cancel()
        }
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
