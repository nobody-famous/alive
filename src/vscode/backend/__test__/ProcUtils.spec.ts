import { PassThrough } from 'stream'
import { getClSourceRegistryEnv, startWarningTimer, waitForPort } from '../ProcUtils'
import path = require('path')

jest.useFakeTimers()

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

        it('No streams', async () => {
            try {
                const opts = {
                    child: {
                        stdout: null,
                        stderr: null,
                        on: jest.fn(),
                    },
                    onDisconnect: jest.fn(),
                    onError: jest.fn(),
                    onErrData: jest.fn(),
                    onOutData: jest.fn(),
                    onWarning: jest.fn(),
                }
                await waitForPort(opts)
                expect(true).toBe(false)
            } catch (err) {}
        })
    })

    describe('getClSourceRegistryEnv', () => {
        it('No registry', () => {
            expect(getClSourceRegistryEnv('/some/path', { foo: 'bar' })).toMatchObject({ foo: 'bar' })
        })

        it('Has registry expression', () => {
            expect(getClSourceRegistryEnv('/some/path', { CL_SOURCE_REGISTRY: '(expr)' })).toMatchObject({
                CL_SOURCE_REGISTRY: '(expr (:directory "/some/path"))',
            })
        })

        it('Has registry path', () => {
            expect(getClSourceRegistryEnv('/some/path', { CL_SOURCE_REGISTRY: 'reg/path' })).toMatchObject({
                CL_SOURCE_REGISTRY: `reg/path${path.delimiter}/some/path`,
            })
        })
    })

    describe('startWarningTimer', () => {
        it('Timed out', () => {
            const fn = jest.fn()

            startWarningTimer(fn, 1000)

            jest.runAllTimers()

            expect(fn).toHaveBeenCalled()
        })

        it('Cancel', () => {
            const fn = jest.fn()

            const fns = startWarningTimer(fn, 1000)

            fns?.cancel()
            jest.runAllTimers()

            expect(fn).not.toHaveBeenCalled()
        })

        it('Invalid timeout', () => {
            expect(startWarningTimer(() => {}, NaN)).toBeUndefined()
        })
    })
})
