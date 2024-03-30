import * as path from 'path'
import { types } from 'util'
import { Readable } from 'stream'
import { isFiniteNumber, isString } from '../Guards'
import EventEmitter = require('events')

type WaitStream = Pick<Readable, 'setEncoding' | 'on'>

interface WaitForPortOpts {
    onDisconnect: (code: number, signal: string) => Promise<void>
    onError: (err: Error) => void
    onErrData: (data: unknown) => void
    onOutData: (data: unknown) => void
    child: {
        on: (event: string, listener: (...args: unknown[]) => void) => Pick<EventEmitter, 'on'>
    }
    stderr: WaitStream
    stdout: WaitStream
}

export const waitForPort = (opts: WaitForPortOpts) => {
    return new Promise<number | null>((resolve, reject) => {
        const handleError = (err: Error) => {
            opts.onError(err)
            reject(new Error(`Couldn't spawn server: ${err.message}`))
        }

        const handleOutData = (data: unknown) => {
            opts.onOutData(data)

            if (!isString(data)) {
                return
            }

            const port = parsePort(data)
            if (!isFiniteNumber(port)) {
                return
            }

            resolve(port)
        }

        setCallbacks({
            child: opts.child,
            stdout: opts.stdout,
            stderr: opts.stderr,
            onDisconnect: opts.onDisconnect,
            onError: handleError,
            onErrData: opts.onErrData,
            onOutData: handleOutData,
        })
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
        return
    }

    const timer = setTimeout(onWarning, timeoutInMs)

    return {
        cancel(): void {
            clearTimeout(timer)
        },
    }
}

const setCallbacks = (opts: WaitForPortOpts) => {
    opts.stdout.on('data', opts.onOutData)
    opts.stderr.on('data', opts.onErrData)

    const doDisconnect = (...args: unknown[]) => {
        const code = isFiniteNumber(args[0]) ? args[0] : 0
        const signal = isString(args[1]) ? args[1] : 'Unknown signal'

        opts.onDisconnect(code, signal)
    }

    opts.child.on('exit', doDisconnect)
    opts.child.on('disconnect', doDisconnect)

    opts.child.on('error', (arg: unknown) => {
        const err = types.isNativeError(arg) ? arg : new Error(`Unknown error: ${arg}`)
        opts.onError(err)
    })
}

const parsePort = (data: string): number | undefined => {
    const match = data.match(/.*Started on port (\d+)/)
    const port = parseInt(match?.[1] ?? '')

    return isFiniteNumber(port) ? port : undefined
}
