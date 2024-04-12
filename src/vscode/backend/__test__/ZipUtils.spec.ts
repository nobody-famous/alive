import * as path from 'path'
import { getUnzippedPath, unzipFile, writeZipFile } from '../ZipUtils'
import EventEmitter = require('events')

const fsMock = jest.requireMock('fs')
jest.mock('fs')
jest.mock('node-stream-zip')

describe('ZipUtils tests', () => {
    describe('writeZipFile', () => {
        const getCallbacks = () => {
            const callbacks: Record<string, (err?: Error) => void> = {}
            const pipe = () => ({
                on: jest.fn((n: string, fn: () => void) => {
                    callbacks[n] = fn
                    return new EventEmitter()
                }),
            })

            const task = writeZipFile('/some/path', { pipe })

            return { task, callbacks }
        }

        it('finish', async () => {
            const { task, callbacks } = getCallbacks()

            callbacks['finish']?.()
            await task
        })

        it('close', async () => {
            const { task, callbacks } = getCallbacks()

            callbacks['close']?.()
            await task
        })

        it('error', async () => {
            const { task, callbacks } = getCallbacks()

            callbacks['error']?.(new Error('Failed, as requested'))
            expect(async () => task).rejects.toThrow()
        })
    })

    it('unzipFile', async () => {
        await unzipFile('/some/path', 'file.name')
    })

    describe('getUnzippedPath', () => {
        it('No directories', async () => {
            fsMock.promises = { readdir: jest.fn(() => []) }
            expect(await getUnzippedPath('/base/path')).toBe('/base/path')
        })

        it('Have directories', async () => {
            fsMock.promises = {
                readdir: jest.fn(() => [
                    { isDirectory: jest.fn(() => false) },
                    { isDirectory: jest.fn(() => true), name: 'foo' },
                ]),
            }
            expect(await getUnzippedPath('/base/path')).toBe(path.join('/base/path', 'foo'))
        })
    })
})
