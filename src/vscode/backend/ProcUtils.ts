import { ChildProcess } from 'child_process'
import * as path from 'path'
import { Readable } from 'stream'
import { types } from 'util'
import { isFiniteNumber, isString } from '../Guards'
import { log, toLog } from '../Log'
import EventEmitter = require('events')

export type WaitStream = Pick<Readable, 'setEncoding' | 'on' | 'off'>

export interface WaitForPortOpts {
    onOutData: (data: unknown) => void
    child: {
        on: (event: string, listener: (...args: unknown[]) => void) => Pick<EventEmitter, 'on'>
        off: (event: string, listener: (...args: unknown[]) => void) => void
    }
    stderr: WaitStream
    stdout: WaitStream
}

export const waitForPort = (opts: WaitForPortOpts) => {
    return new Promise<number>((resolve, reject) => {
        const handleOutData = (data: unknown) => {
            opts.onOutData(data)

            if (!isString(data)) {
                return
            }

            const port = parsePort(data)
            if (!isFiniteNumber(port)) {
                return
            }

            unsetCallbacks()
            resolve(port)
        }

        const handleError = (arg: unknown) => {
            unsetCallbacks()
            reject(types.isNativeError(arg) ? arg : new Error(`Unknown error: ${arg}`))
        }

        const doDisconnect = (...args: unknown[]) => {
            const code = isFiniteNumber(args[0]) ? args[0] : 0
            const signal = isString(args[1]) ? args[1] : 'Unknown signal'

            unsetCallbacks()
            reject(new Error(`Disconnected: CODE ${code} SIGNAL ${signal}`))
        }

        const setCallbacks = () => {
            opts.stdout.on('data', handleOutData)

            opts.child.on('exit', doDisconnect)
            opts.child.on('disconnect', doDisconnect)

            opts.child.on('error', handleError)
        }

        const unsetCallbacks = () => {
            opts.stdout.off('data', handleOutData)

            opts.child.off('exit', doDisconnect)
            opts.child.off('disconnect', doDisconnect)

            opts.child.off('error', handleError)
        }

        setCallbacks()
    })
}

export function getClSourceRegistryEnv(
    installPath: string,
    processEnv: NodeJS.ProcessEnv
): { [key: string]: string | undefined } {
    const updatedEnv = { ...processEnv }

    if (!processEnv.CL_SOURCE_REGISTRY) {
        updatedEnv.CL_SOURCE_REGISTRY = installPath + path.delimiter
        return updatedEnv
    }

    if (processEnv.CL_SOURCE_REGISTRY.startsWith('(')) {
        const pathSExpressionEnding = ` (:directory "${installPath}")`
        updatedEnv.CL_SOURCE_REGISTRY = `${processEnv.CL_SOURCE_REGISTRY.replace(/\)$/, pathSExpressionEnding)})`
        return updatedEnv
    }

    updatedEnv.CL_SOURCE_REGISTRY = `${processEnv.CL_SOURCE_REGISTRY}${path.delimiter}${installPath}`
    return updatedEnv
}

export function startWarningTimer(onWarning: () => void, timeoutInMs: number) {
    if (!isFiniteNumber(timeoutInMs)) {
        return {
            cancel: () => {},
        }
    }

    const timer = setTimeout(onWarning, timeoutInMs)

    return {
        cancel(): void {
            clearTimeout(timer)
        },
    }
}

export async function disconnectChild(child: Pick<ChildProcess, 'exitCode' | 'kill'>, maxAttemps: number = 5) {
    if (child.exitCode !== null) {
        log('Disconnect: Child already exited')
        return true
    }

    log('Killing child')

    let killAttempts = 0

    while (killAttempts < maxAttemps) {
        log(`Kill attempt ${toLog(killAttempts)}`)

        killAttempts++

        if (child.kill() || typeof child.exitCode === 'number') {
            log('Killed child')
            return true
        }

        await new Promise((r) => setTimeout(r, 1000))
    }

    return false
}

const parsePort = (data: string): number | undefined => {
    const match = data.match(/.*Started on port (\d+)/)
    const port = parseInt(match?.[1] ?? '')

    return isFiniteNumber(port) ? port : undefined
}
