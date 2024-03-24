import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { isFiniteNumber, isGitHubVersion } from '../Guards'
import { log, toLog } from '../Log'
import { AliveLspVersion, GitHubVersion } from '../Types'
import { getUnzippedPath, readZipFile, unzipFile } from './ZipUtils'

export async function getLatestVersion(url: string): Promise<AliveLspVersion | undefined> {
    log('Get latest version')

    const resp = await axios(url, {
        headers: { 'User-Agent': 'nobody-famous/alive' },
        method: 'GET',
    })

    if (!Array.isArray(resp.data)) {
        log(`Response not an array: ${toLog(resp.data)}`)
        return
    }

    const versions = resp.data.filter(isGitHubVersion)

    log(`Versions: ${toLog(versions)}`)

    versions.sort((a, b) => {
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
    })

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

    await fs.promises.mkdir(zipPath, { recursive: true })
    await readZipFile(zipFile, resp)
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
