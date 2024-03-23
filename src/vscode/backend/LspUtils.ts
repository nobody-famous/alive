import axios from 'axios'
import * as vscode from 'vscode'
import { isFiniteNumber } from '../Guards'
import { log, toLog } from '../Log'

export async function getLatestVersion<T extends { createdAt: string }>(
    url: string,
    guard: (data: unknown) => data is T
): Promise<T | undefined> {
    log('Get latest version')

    const resp = await axios(url, {
        headers: { 'User-Agent': 'nobody-famous/alive' },
        method: 'GET',
    })

    if (!Array.isArray(resp.data)) {
        log(`Response not an array: ${toLog(resp.data)}`)
        return
    }

    const versions = resp.data.filter(guard)

    log(`Versions: ${toLog(versions)}`)

    versions.sort((a, b) => {
        let aTime = Date.parse(a.createdAt)
        let bTime = Date.parse(b.createdAt)

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

    return versions[0]
}

export function getDownloadUrl() {
    const config = vscode.workspace.getConfiguration('alive')
    return config.lsp?.downloadUrl
}
