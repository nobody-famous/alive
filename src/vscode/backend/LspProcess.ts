import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import * as path from 'path'
import { types } from 'util'
import * as vscode from 'vscode'
import { isFiniteNumber, isNodeSignal, isString } from '../Guards'
import { log, toLog } from '../Log'
import { AliveLspVersion } from '../Types'
import { getLspBasePath } from '../Utils'
import {
    createPath,
    doesPathExist,
    getInstalledVersion,
    getLatestVersion,
    nukeInstalledVersion,
    pullLatestVersion,
} from './LspUtils'
import { getClSourceRegistryEnv, startWarningTimer, waitForPort } from './ProcUtils'
import { getUnzippedPath } from './ZipUtils'

const lspOutputChannel = vscode.window.createOutputChannel('Alive LSP')

export interface LspSpawnOpts {
    lspInstallPath: string
    workspacePath: string
    command: string[]
    onDisconnect: (code: number, signal: NodeJS.Signals | 'UNKNOWN') => void
    onError: (err: Error) => void
}

export async function spawnLspProcess({ lspInstallPath, workspacePath, command, onDisconnect, onError }: LspSpawnOpts) {
    const spawnOpts = {
        env: getClSourceRegistryEnv(lspInstallPath, process.env),
        cwd: workspacePath,
    }

    log(`ENV: ${toLog(spawnOpts.env)}`)
    log(`CWD: ${toLog(spawnOpts.cwd)}`)
    log(`Spawning child: ${toLog(command[0])}`)

    const child = spawn(command[0], command.slice(1), spawnOpts)

    log(`Spawned: ${toLog(command[0])}`)

    const doDisconnect = (...args: unknown[]) => {
        const code = isFiniteNumber(args[0]) ? args[0] : 0
        const signal = isNodeSignal(args[1]) ? args[1] : 'UNKNOWN'

        onDisconnect(code, signal)
    }

    child.on('exit', doDisconnect)
    child.on('disconnect', doDisconnect)
    child.on('error', (arg: unknown) => {
        const err = types.isNativeError(arg) ? arg : new Error(`Unknown error: ${arg}`)
        onError(err)
    })

    child.stdout.setEncoding('utf-8').on('data', (data: unknown) => {
        lspOutputChannel.append(`${data}`)
    })
    child.stderr.setEncoding('utf-8').on('data', (data: unknown) => {
        lspOutputChannel.append(`${data}`)
    })

    const port = await listenForServerPort(child)

    return { child, port }
}

async function listenForServerPort(child: ChildProcessWithoutNullStreams): Promise<number | undefined> {
    const timer = startWarningTimer(() => {
        vscode.window.showWarningMessage('LSP start is taking an unexpectedly long time')
        lspOutputChannel.show()
    }, 10000)

    try {
        log('Start LSP server')

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
            child,
            stdout: child.stdout.setEncoding('utf-8'),
            stderr: child.stderr.setEncoding('utf-8'),
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
