import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import { AliveLspVersion, ExtensionState } from '../Types'
import { getWorkspaceOrFilePath } from '../Utils'
import { log, toLog } from '../Log'
import axios, { AxiosResponse } from 'axios'
import StreamZip = require('node-stream-zip')

const lspOutputChannel = vscode.window.createOutputChannel('Alive LSP')

export async function startLspServer(state: ExtensionState): Promise<number> {
    return new Promise<number>(async (resolve, reject) => {
        try {
            log(`Start LSP server`)

            if (typeof state.lspInstallPath !== 'string') {
                log(`Invalid install path: ${toLog(state.lspInstallPath)}`)
                return reject('No LSP server install path')
            }

            const lspConfig = vscode.workspace.getConfiguration('alive.lsp')

            log(`LSP config: ${toLog(lspConfig)}`)

            const cmd = lspConfig.get('startCommand')

            log(`Command: ${toLog(cmd)}`)

            const env = getClSourceRegistryEnv(state.lspInstallPath, process.env)

            log(`ENV: ${toLog(env)}`)

            const cwd = await getWorkspaceOrFilePath()

            log(`CWD: ${toLog(cwd)}`)

            if (!Array.isArray(cmd)) {
                log(`Invalid command: ${toLog(cmd)}`)
                return reject('No command defined, cannot start LSP server')
            }

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

            log(`Spawning child: ${toLog(cmd[0])}`)

            state.child = spawn(cmd[0], cmd.slice(1), { cwd, env })

            log(`Spawned: ${toLog(cmd[0])}`)

            state.child.stdout?.setEncoding('utf-8').on('data', (data) => {
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

            state.child.stderr?.setEncoding('utf-8').on('data', (data) => {
                log(`${toLog(cmd[0])} ERROR: ${toLog(data)}`)

                appendOutputData(data)
            })

            state.child
                .on('exit', handleDisconnect(state))
                .on('disconnect', handleDisconnect(state))
                .on('error', (err: Error) => {
                    log(`Failed to spawn ${toLog(cmd[0])}: ${toLog(err)}`)

                    timer.cancel()
                    reject(`Couldn't spawn server: ${err.message}`)
                })
        } catch (err) {
            log(`Failed to start LSP server: ${err}`)

            reject(err)
        }
    })
}

export async function downloadLspServer(): Promise<string | undefined> {
    log(`Download LSP server`)

    const config = vscode.workspace.getConfiguration('alive.lsp')

    log(`LSP config: ${toLog(config)}`)

    const cfgInstallPath = config.get('install.path')

    log(`Config install path: ${toLog(cfgInstallPath)}`)

    if (typeof cfgInstallPath === 'string' && cfgInstallPath !== '') {
        log(`Found ${toLog(cfgInstallPath)}, returning`)
        return cfgInstallPath
    }

    const basePath = getLspBasePath()

    log(`Base path: ${toLog(basePath)}`)

    const latestVersion = await getLatestVersion()

    log(`Latest version: ${toLog(latestVersion)}`)

    const installedVersion = await getInstalledVersion(basePath)

    log(`Installed version: ${toLog(installedVersion)}`)

    if (installedVersion === undefined) {
        if (latestVersion === undefined) {
            throw new Error(`Could not find latest LSP server version`)
        }

        return await pullLatestVersion(basePath, latestVersion.tagName, latestVersion.zipballUrl)
    } else if (latestVersion === undefined) {
        return getUnzippedPath(path.join(basePath, installedVersion))
    } else if (installedVersion !== latestVersion.tagName) {
        await nukeInstalledVersion(basePath)

        return await pullLatestVersion(basePath, latestVersion.tagName, latestVersion.zipballUrl)
    } else {
        return getUnzippedPath(path.join(basePath, installedVersion))
    }
}

async function nukeInstalledVersion(basePath: string) {
    log(`Removing path: ${toLog(basePath)}`)
    await fs.promises.rm(basePath, { recursive: true })
}

async function pullLatestVersion(basePath: string, version: string, url: string): Promise<string> {
    vscode.window.showInformationMessage('Installing LSP server')

    try {
        const zipPath = path.normalize(path.join(basePath, version))
        const zipFile = path.join(zipPath, `${version}.zip`)

        const resp = await axios(url, {
            headers: { 'User-Agent': 'nobody-famous/alive' },
            method: 'GET',
            responseType: 'stream',
        })

        await fs.promises.mkdir(zipPath, { recursive: true })
        await readZipFile(zipFile, resp)
        await unzipFile(zipPath, zipFile)

        return await getUnzippedPath(zipPath)
    } finally {
        vscode.window.showInformationMessage('Done installing LSP server')
    }
}

async function getUnzippedPath(basePath: string): Promise<string> {
    const files = await fs.promises.readdir(basePath, { withFileTypes: true })
    const dirs = files.filter((entry) => entry.isDirectory()).map((entry) => entry.name)

    return dirs.length === 0 ? basePath : path.join(basePath, dirs[0])
}

async function unzipFile(basePath: string, file: string) {
    const zip = new StreamZip.async({ file })

    await zip.extract(null, basePath)
    await zip.close()
}

async function readZipFile(file: string, resp: AxiosResponse<any>) {
    const writer = fs.createWriteStream(file)

    return new Promise((resolve, reject) => {
        resp.data.pipe(writer).on('finish', resolve).on('close', resolve).on('error', reject)
    })
}

async function getLatestVersion(): Promise<AliveLspVersion | undefined> {
    log(`Get latest version`)

    const config = vscode.workspace.getConfiguration('alive')
    const url = config.lsp?.downloadUrl

    log(`URL: ${toLog(url)}`)

    if (typeof url !== 'string') {
        log(`URL not a string: ${typeof url}`)
        return
    }

    const resp = await axios(url, {
        headers: { 'User-Agent': 'nobody-famous/alive' },
        method: 'GET',
    })

    if (!Array.isArray(resp.data)) {
        log(`Response not an array: ${toLog(resp.data)}`)
        return
    }

    const versions = resp.data.map((data) => parseVersionData(data)).filter((entry) => entry !== undefined)

    log(`Versions: ${toLog(versions)}`)

    versions.sort((a, b) => {
        if (
            typeof a?.createdAt === 'number' &&
            Number.isFinite(a.createdAt) &&
            typeof b?.createdAt === 'number' &&
            Number.isFinite(b.createdAt)
        ) {
            if (a.createdAt > b.createdAt) {
                return -1
            } else if (a.createdAt < b.createdAt) {
                return 1
            } else {
                return 0
            }
        }

        if (Number.isFinite(a?.createdAt) && !Number.isFinite(b?.createdAt)) {
            return -1
        } else if (!Number.isFinite(a?.createdAt) && Number.isFinite(b?.createdAt)) {
            return 1
        } else if (!Number.isFinite(a?.createdAt) && !Number.isFinite(b?.createdAt)) {
            return 0
        }

        return 0
    })

    log(`Versions sorted: ${toLog(versions)}`)

    return versions[0]
}

async function getInstalledVersion(basePath: string): Promise<string | undefined> {
    log(`Get installed version: ${toLog(basePath)}`)

    try {
        await fs.promises.access(basePath)
    } catch (err) {
        log(`Creating path: ${toLog(basePath)}`)
        await fs.promises.mkdir(basePath, { recursive: true })
    }

    const files = await fs.promises.readdir(basePath)

    log(`Files: ${toLog(files)}`)

    if (files.length > 1) {
        await nukeInstalledVersion(basePath)
        return
    }

    return files[0]
}

function parseVersionData(data: unknown): AliveLspVersion | undefined {
    if (typeof data !== 'object' || data === null) {
        return
    }

    const dataObj = data as { [index: string]: unknown }

    if (
        typeof dataObj.created_at !== 'string' ||
        typeof dataObj.name !== 'string' ||
        typeof dataObj.tag_name !== 'string' ||
        typeof dataObj.zipball_url !== 'string'
    ) {
        return
    }

    const createdAtDate = Date.parse(dataObj.created_at)

    if (!Number.isFinite(createdAtDate)) {
        return
    }

    return {
        createdAt: createdAtDate,
        name: dataObj.name,
        tagName: dataObj.tag_name,
        zipballUrl: dataObj.zipball_url,
    }
}

function getLspBasePath(): string {
    const extensionMetadata = vscode.extensions.getExtension('rheller.alive')

    if (!extensionMetadata) {
        throw new Error('Failed to find rheller.alive extension config directory')
    }

    return path.normalize(path.join(extensionMetadata.extensionPath, 'out', 'alive-lsp'))
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
        log(`Child exited`)
        state.child = undefined
        return false
    }

    log(`Killing child`)

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

    log(`Killed child`)

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
