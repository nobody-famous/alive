import * as vscode from 'vscode'
import { isObject } from './Guards'

const logOutputChannel = vscode.window.createOutputChannel('Alive Log')

export const log = (message: string) => {
    logOutputChannel.appendLine(message)
}

export const toLog = (obj: unknown): string => {
    if (isObject(obj)) {
        return JSON.stringify(obj)
    }

    return `${obj}`
}
