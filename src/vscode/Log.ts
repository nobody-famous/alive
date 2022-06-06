import * as vscode from 'vscode'

const logOutputChannel = vscode.window.createOutputChannel('Alive Log')

export const log = (message: string) => {
    logOutputChannel.appendLine(message)
}

export const toLog = (obj: unknown): string => {
    if (typeof obj === 'object') {
        return JSON.stringify(obj)
    }

    return `${obj}`
}
