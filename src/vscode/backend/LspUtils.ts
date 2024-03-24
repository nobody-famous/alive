import axios from 'axios'
import { isFiniteNumber, isGitHubVersion } from '../Guards'
import { log, toLog } from '../Log'
import { AliveLspVersion, GitHubVersion } from '../Types'

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

function toAliveLspVersion(version: GitHubVersion): AliveLspVersion {
    const date = Date.parse(version.created_at)

    return {
        createdAt: isFiniteNumber(date) ? date : 0,
        name: version.name,
        tagName: version.tag_name,
        zipballUrl: version.zipball_url,
    }
}
