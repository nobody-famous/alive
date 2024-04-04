import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { isFiniteNumber, isGitHubVersion, isObject } from '../Guards'
import { log, toLog } from '../Log'
import { AliveLspVersion, GitHubVersion } from '../Types'
import { getUnzippedPath, unzipFile, writeZipFile } from './ZipUtils'
import EventEmitter = require('events')

export async function getLatestVersion(url: string): Promise<AliveLspVersion | undefined> {
    log('Get latest version')

    const data = await fetchVersions(url)

    if (data === undefined) {
        return undefined
    }

    const versions = data.filter(isGitHubVersion)

    log(`Versions: ${toLog(versions)}`)

    if (versions.length === 0) {
        return undefined
    }

    versions.sort(sortVersions)

    log(`Versions sorted: ${toLog(versions)}`)

    return toAliveLspVersion(versions[0])
}

export async function getInstalledVersion(basePath: string): Promise<string | undefined> {
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

export async function nukeInstalledVersion(basePath: string) {
    log(`Removing path: ${toLog(basePath)}`)
    await fs.promises.rm(basePath, { recursive: true })
}

export async function pullLatestVersion(basePath: string, version: string, url: string): Promise<string> {
    const zipPath = path.normalize(path.join(basePath, version))
    const zipFile = path.join(zipPath, `${version}.zip`)

    const resp = await axios(url, {
        headers: { 'User-Agent': 'nobody-famous/alive' },
        method: 'GET',
        responseType: 'stream',
    })

    const isPipeFunction = (f: unknown): f is () => EventEmitter => {
        return typeof f === 'function' && f.length === 1
    }

    if (!isObject(resp.data) || !isPipeFunction(resp.data.pipe)) {
        throw new Error('Invalid response, no stream pipe')
    }

    await fs.promises.mkdir(zipPath, { recursive: true })
    await writeZipFile(zipFile, resp.data.pipe)
    await unzipFile(zipPath, zipFile)

    return await getUnzippedPath(zipPath)
}

function toAliveLspVersion(version: GitHubVersion): AliveLspVersion {
    const date = Date.parse(version.created_at)

    return {
        createdAt: isFiniteNumber(date) ? date : 0,
        name: version.name,
        tagName: version.tag_name,
        zipballUrl: version.zipball_url,
    }
}

async function fetchVersions(url: string) {
    const resp = await axios(url, {
        headers: { 'User-Agent': 'nobody-famous/alive' },
        method: 'GET',
    })

    if (!isObject(resp) || !Array.isArray(resp.data)) {
        log(`Response not an array: ${toLog(resp?.data)}`)
        return
    }

    return resp.data
}

function sortVersions(a: GitHubVersion, b: GitHubVersion) {
    let aTime = Date.parse(a.created_at)
    let bTime = Date.parse(b.created_at)

    aTime = isFiniteNumber(aTime) ? aTime : 0
    bTime = isFiniteNumber(bTime) ? bTime : 0

    if (aTime > bTime) {
        return -1
    } else if (aTime < bTime) {
        return 1
    } else {
        return 0
    }
}
