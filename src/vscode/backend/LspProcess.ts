import { spawn } from 'child_process'
import * as path from 'path'
import * as vscode from 'vscode'
import { isString } from '../Guards'
import { log, toLog } from '../Log'
import { AliveLspVersion, ExtensionState } from '../Types'
import { getLspBasePath } from '../Utils'
import {
    createPath,
    doesPathExist,
    getInstalledVersion,
    getLatestVersion,
    nukeInstalledVersion,
    pullLatestVersion,
} from './LspUtils'
import { WaitStream, disconnectChild, getClSourceRegistryEnv, startWarningTimer, waitForPort } from './ProcUtils'
import { getUnzippedPath } from './ZipUtils'

const lspOutputChannel = vscode.window.createOutputChannel('Alive LSP')

export function spawnLspProcess(lspInstallPath: string, workspacePath: string, command: string[]) {
    const spawnOpts = {
        env: getClSourceRegistryEnv(lspInstallPath, process.env),
        cwd: workspacePath,
    }

    log(`ENV: ${toLog(spawnOpts.env)}`)
    log(`CWD: ${toLog(spawnOpts.cwd)}`)
    log(`Spawning child: ${toLog(command[0])}`)

    const child = spawn(command[0], command.slice(1), spawnOpts)

    log(`Spawned: ${toLog(command[0])}`)

    return child
}

export async function listenForServerPort(
    state: Pick<ExtensionState, 'child'>,
    stdout: WaitStream,
    stderr: WaitStream
): Promise<number | undefined> {
    if (state.child === undefined) {
        return
    }

    const timer = startWarningTimer(() => {
        vscode.window.showWarningMessage('LSP start is taking an unexpectedly long time')
        lspOutputChannel.show()
    }, 10000)

    try {
        log('Start LSP server')

        const handleDisconnect = async (code: number, signal: string) => {
            log(`Disconnected: CODE ${toLog(code)} SIGNAL ${toLog(signal)}`)

            if (state.child === undefined) {
                return
            }

            try {
                if (!(await disconnectChild(state.child))) {
                    vscode.window.showWarningMessage('Disconnect: Failed to kill child process')
                }
            } catch (err) {
                vscode.window.showWarningMessage(`Disconnect: ${toLog(err)}`)
            } finally {
                state.child = undefined
            }
        }

        const appendOutputData = (data: unknown) => {
            lspOutputChannel.append(`${data}`)
        }

        const handleErrData = (data: unknown) => {
            log(`ERROR: ${toLog(data)}`)
            appendOutputData(data)
        }

        const handleOutData = (data: unknown) => {
            appendOutputData(data)
        }

        return await waitForPort({
            child: state.child,
            stdout: stdout.setEncoding('utf-8'),
            stderr: stderr.setEncoding('utf-8'),
            onDisconnect: handleDisconnect,
            onErrData: (data: unknown) => handleErrData(data),
            onOutData: handleOutData,
        })
    } finally {
        timer.cancel()
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

        if (!(await doesPathExist(basePath))) {
            await createPath(basePath)
        }

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
