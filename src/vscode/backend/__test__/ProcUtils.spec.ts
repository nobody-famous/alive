import { PassThrough } from 'stream'
import { waitForPort } from '../ProcUtils'

describe('ProcUtils tests', () => {
    describe('waitForPort', () => {
        const getCallbacks = () => {
            const callbacks: Record<string, Function> = {}
            const errPass = new PassThrough()
            const outPass = new PassThrough()

            errPass.on = jest.fn((name: string, fn: (err: Error) => void) => {
                callbacks['stderr'] = fn
                return new PassThrough()
            })
            outPass.on = jest.fn((name: string, fn: (err: Error) => void) => {
                callbacks['stdout'] = fn
                return new PassThrough()
            })

            const opts = {
                child: {
                    stdout: outPass,
                    stderr: errPass,
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

        it('handleOutData', async () => {
            const { task, callbacks } = getCallbacks()

            callbacks['stdout']?.(10)
            callbacks['stdout']?.('Some stuff')
            callbacks['stdout']?.('{This can be ignored} Started on port 1234')

            expect(await task).toBe(1234)
        })
    })
})
