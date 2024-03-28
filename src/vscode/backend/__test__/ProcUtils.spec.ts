import { PassThrough } from 'stream'
import { waitForPort } from '../ProcUtils'

describe('ProcUtils tests', () => {
    describe('waitForPort', () => {
        const getCallbacks = () => {
            const callbacks: Record<string, Function> = {}
            const opts = {
                child: {
                    stdout: new PassThrough(),
                    stderr: new PassThrough(),
                    on: jest.fn((name: string, fn: () => void) => {
                        callbacks[name] = fn
                        return new PassThrough()
                    }),
                },
                onDisconnect: jest.fn(),
                onError: jest.fn(),
                onErrData: jest.fn(),
                onOutData: jest.fn(),
                onWarning: jest.fn(),
            }

            const task = waitForPort(opts)

            return { task, callbacks }
        }

        it('handleError', async () => {
            const { task, callbacks } = getCallbacks()

            try {
                callbacks['error']?.(new Error('Failed, as requested'))
                await task
                expect(true).toBe(false)
            } catch (err) {}
        })
    })
})
