import { PassThrough } from 'stream'
import { getClSourceRegistryEnv, startWarningTimer, waitForPort } from '../ProcUtils'
import path = require('path')

jest.mock('stream')

jest.useFakeTimers()

describe('ProcUtils tests', () => {
    describe('waitForPort', () => {
        const getCallbacks = () => {
            const callbacks: Record<string, (...args: unknown[]) => void> = {}
            const opts = {
                child: {
                    on: jest.fn((name: string, fn: () => void) => {
                        callbacks[name] = fn
                        return { on: jest.fn() }
                    }),
                },
                stdout: {
                    setEncoding: jest.fn(),
                    on: jest.fn((name, fn) => {
                        callbacks['stdout'] = fn
                        return new PassThrough()
                    }),
                },
                stderr: {
                    setEncoding: jest.fn(),
                    on: jest.fn((name, fn) => {
                        callbacks['stderr'] = fn
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

        it('exit', async () => {
            const { task, callbacks } = getCallbacks()

            callbacks['stdout']?.('{This can be ignored} Started on port 1234')

            callbacks['exit']?.(5, 'Fake signal')
            callbacks['exit']?.(NaN, {})
            callbacks['exit']?.()

            await task
        })

        it('disconnect', async () => {})

        it('handleError', async () => {
            const { task, callbacks } = getCallbacks()

            callbacks['error']?.('Failed, as requested')
            callbacks['error']?.(new Error('Failed, as requested'))
            await expect(async () => await task).rejects.toThrow(Error)
        })

        it('handleOutData', async () => {
            const { task, callbacks } = getCallbacks()

            callbacks['stdout']?.(10)
            callbacks['stdout']?.('Some stuff')
            callbacks['stdout']?.('{This can be ignored} Started on port 1234')

            expect(await task).toBe(1234)
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
