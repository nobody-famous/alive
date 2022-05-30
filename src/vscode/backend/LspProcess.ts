import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import { AliveLspVersion, ExtensionState } from '../Types'
import { getWorkspaceOrFilePath } from '../Utils'
import axios, { AxiosResponse } from 'axios'
import StreamZip = require('node-stream-zip')

const lspOutputChannel = vscode.window.createOutputChannel('Alive LSP')

export async function startLspServer(state: ExtensionState): Promise<number> {
    return new Promise(async (resolve, reject) => {
        if (typeof state.lspInstallPath !== 'string') {
            return reject('No LSP server install path')
        }

        const lspConfig = vscode.workspace.getConfiguration('alive.lsp')
        const cmd = lspConfig.get('startCommand')
        const env = getClSourceRegistryEnv(state.lspInstallPath, process.env)
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

export async function downloadLspServer(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('alive.lsp')
    const cfgInstallPath = config.get('install.path')

    if (typeof cfgInstallPath === 'string' && cfgInstallPath !== '') {
        return cfgInstallPath
    }

    const basePath = getLspBasePath()
    const latestVersion = await getLatestVersion()
    const installedVersion = await getInstalledVersion(basePath)

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
    const config = vscode.workspace.getConfiguration('alive')
    const url = config.lsp?.downloadUrl

    if (typeof url !== 'string') {
        return
    }

    const resp = await axios(url, {
        headers: { 'User-Agent': 'nobody-famous/alive' },
        method: 'GET',
    })

    if (!Array.isArray(resp.data)) {
        return
    }

    const versions = resp.data.map((data) => parseVersionData(data))

    return versions[0]
}

async function getInstalledVersion(basePath: string): Promise<string | undefined> {
    try {
        await fs.promises.access(basePath)
    } catch (err) {
        await fs.promises.mkdir(basePath, { recursive: true })
    }

    const files = await fs.promises.readdir(basePath)

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

    return {
        createdAt: dataObj.created_at,
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
