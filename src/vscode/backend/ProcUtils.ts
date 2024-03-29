import * as path from 'path'
import { Readable } from 'stream'
import { isFiniteNumber, isString } from '../Guards'
import EventEmitter = require('events')

type WaitStream = Pick<Readable, 'setEncoding'>

interface WaitForPortOpts {
    onDisconnect: (code: number, signal: string) => Promise<void>
    onError: (err: Error) => void
    onErrData: (data: unknown) => void
    onOutData: (data: unknown) => void
    onWarning: () => void
    child: {
        stderr: WaitStream | null
        stdout: WaitStream | null
        on: (event: string, listener: (...args: any[]) => void) => EventEmitter
    }
}

export const waitForPort = (opts: WaitForPortOpts) => {
    return new Promise<number | null>((resolve, reject) => {
        const handleError = (err: Error) => {
            opts.onError(err)
            reject(`Couldn't spawn server: ${err.message}`)
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

        if (opts.child.stdout === null || opts.child.stderr === null) {
            return reject('Missing child streams')
        }

        setCallbacks(
            { stdout: opts.child.stdout, stderr: opts.child.stderr },
            {
                child: opts.child,
                onDisconnect: opts.onDisconnect,
                onError: handleError,
                onErrData: opts.onErrData,
                onOutData: handleOutData,
                onWarning: opts.onWarning,
            }
        )
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

    let timer = setTimeout(onWarning, timeoutInMs)

    return {
        cancel(): void {
            clearTimeout(timer)
        },
    }
}

const setCallbacks = (streams: { stdout: WaitStream; stderr: WaitStream }, opts: WaitForPortOpts) => {
    streams.stdout.setEncoding('utf-8').on('data', opts.onOutData)
    streams.stderr.setEncoding('utf-8').on('data', opts.onErrData)

    opts.child.on('exit', opts.onDisconnect).on('disconnect', opts.onDisconnect).on('error', opts.onError)
    opts.child.on('disconnect', opts.onDisconnect)
    opts.child.on('error', opts.onError)
}

const parsePort = (data: string): number | undefined => {
    const match = data.match(/.*Started on port (\d+)/)
    const port = parseInt(match?.[1] ?? '')

    return isFiniteNumber(port) ? port : undefined
}
