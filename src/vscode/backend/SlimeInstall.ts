import axios from 'axios'
import * as fs from 'fs'
import * as StreamZip from 'node-stream-zip'
import * as path from 'path'
import * as vscode from 'vscode'
import { InstalledSlimeInfo, SlimeVersion, SwankBackendState } from '../Types'

export async function installAndConfigureSlime(state: SwankBackendState): Promise<InstalledSlimeInfo> {
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

async function installSlime(state: SwankBackendState, version: SlimeVersion | undefined): Promise<InstalledSlimeInfo> {
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

async function getLatestSlimeVersion(): Promise<SlimeVersion> {
    // TODO - Handle Github rate limits for > 60 calls/hour
    const out = await axios(vscode.workspace.getConfiguration('alive').swank.downloadUrl, {
        headers: { 'User-Agent': 'nobody-famous/alive' },
        method: 'GET',
    })
    const versions: SlimeVersion[] = out.data
    return versions.sort((f, s) => (f.created_at > s.created_at ? -1 : f.created_at < s.created_at ? 1 : 0))[0]
}

async function getInstalledVersionName(state: SwankBackendState): Promise<string | undefined> {
    const files = await fs.promises.readdir(getSlimeBasePath(state))
    if (files.length !== 1) {
        await fs.promises.rm(getSlimeBasePath(state), { recursive: true })
        return undefined
    }
    return files[0]
}

async function getSlimePath(state: SwankBackendState, versionName: string): Promise<string | undefined> {
    const files = await fs.promises.readdir(path.join(getSlimeBasePath(state), versionName))
    if (files.length !== 2) {
        await fs.promises.rm(getSlimeBasePath(state), { recursive: true })
        return undefined
    }
    const zipFileName = `${path.basename(versionName)}.zip`
    const hashDirectory = files.filter((f) => f !== zipFileName)[0]
    return path.join(getSlimeBasePath(state), versionName, hashDirectory)
}

function getSlimeBasePath(state: SwankBackendState): string {
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
