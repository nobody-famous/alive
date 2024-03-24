import { AxiosResponse } from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { isObject } from '../Guards'
import StreamZip = require('node-stream-zip')

export async function readZipFile(file: string, resp: AxiosResponse<unknown>) {
    const writer = fs.createWriteStream(file)

    return new Promise((resolve, reject) => {
        if (isObject(resp?.data) && typeof resp.data.pipe === 'function') {
            resp.data.pipe(writer).on('finish', resolve).on('close', resolve).on('error', reject)
        } else {
            reject('Invalid response object')
        }
    })
}

export async function unzipFile(basePath: string, file: string) {
    const zip = new StreamZip.async({ file })

    await zip.extract(null, basePath)
    await zip.close()
}

export async function getUnzippedPath(basePath: string): Promise<string> {
    const files = await fs.promises.readdir(basePath, { withFileTypes: true })
    const dirs = files.filter((entry) => entry.isDirectory()).map((entry) => entry.name)

    return dirs.length === 0 ? basePath : path.join(basePath, dirs[0])
}
