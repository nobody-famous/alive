import EventEmitter = require('events')
import { writeZipFile } from '../ZipUtils'

jest.mock('fs')

describe('ZipUtils tests', () => {
    describe('readZipFile', () => {
        const getCallbacks = () => {
            const callbacks: Record<string, (err?: Error) => void> = {}
            const pipe = () => ({
                on: jest.fn((n: string, fn: () => void) => {
                    callbacks[n] = fn
                    return new EventEmitter()
                }),
            })

            const task = writeZipFile('/some/path', pipe)

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
            await expect(async () => await task).rejects.toThrow(Error)
        })
    })
})
