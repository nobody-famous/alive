import { ChildProcess, SpawnOptionsWithoutStdio } from 'child_process'
import * as path from 'path'
import { isFiniteNumber, isString } from '../Guards'
import { ExtensionState } from '../Types'

interface WaitForPortOpts {
    onDisconnect: (code: number, signal: string) => Promise<void>
    onError: (err: Error) => void
    onErrData: (data: unknown) => void
    onOutData: (data: unknown) => void
    onWarning: () => void
}

export const waitForPort = (child: ChildProcess, opts: WaitForPortOpts) => {
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

        setCallbacks(child, {
            onDisconnect: opts.onDisconnect,
            onError: handleError,
            onErrData: opts.onErrData,
            onOutData: handleOutData,
            onWarning: opts.onWarning,
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

const setCallbacks = (child: ChildProcess, opts: WaitForPortOpts) => {
    child.stdout?.setEncoding('utf-8').on('data', opts.onOutData)
    child.stderr?.setEncoding('utf-8').on('data', opts.onErrData)
    child.on('exit', opts.onDisconnect).on('disconnect', opts.onDisconnect).on('error', opts.onError)
}

function setupWarningTimer(onWarning: () => void) {
    const timeoutInMs = 10000

    let complete = false
    let timer = setTimeout(onWarning, timeoutInMs)

    return {
        restart(): void {
            clearTimeout(timer)
            if (!complete) {
                timer = setTimeout(onWarning, timeoutInMs)
            }
        },
        cancel(): void {
            complete = true
            clearTimeout(timer)
        },
    }
}

const parsePort = (data: string): number | undefined => {
    const match = data.match(/\[(.*?)\]\[(.*?)\] Started on port (\d+)/)
    const port = parseInt(match?.[3] ?? '')

    return isFiniteNumber(port) ? port : undefined
}
