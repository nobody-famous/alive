import * as fs from 'fs'
import * as path from 'path'
import StreamZip = require('node-stream-zip')
import EventEmitter = require('events')

export async function writeZipFile(file: string, data: { pipe: (s: fs.WriteStream) => Pick<EventEmitter, 'on'> }) {
    const writer = fs.createWriteStream(file)

    return new Promise<void>((resolve, reject) => {
        const pipeWriter = data.pipe(writer)

        pipeWriter.on('finish', resolve)
        pipeWriter.on('close', resolve)
        pipeWriter.on('error', reject)
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
