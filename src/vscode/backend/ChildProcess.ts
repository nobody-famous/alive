import * as vscode from 'vscode'
import * as net from 'net'
import { ExtensionState } from '../Types'

export async function startLspServer(state: ExtensionState): Promise<void> {
    if (state.backend === undefined) {
        return
    }

    const defaultPort = state.backend.defaultPort
    const config = vscode.workspace.getConfiguration('alive')

    console.log('INSTALL PATH', config.get('lsp.install.path'))
}

async function portIsAvailable(port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket()
        const timeout = () => {
            socket.destroy()
            resolve(false)
        }

        setTimeout(timeout, 200)

        socket
            .on('timeout', timeout)
            .on('connect', () => resolve(false))
            .on('error', (err: { message: string; code?: string }) => {
                if (err.code === 'ECONNREFUSED') {
                    return resolve(true)
                }
                return reject(err)
            })

        socket.connect(port, '0.0.0.0')
    })
}
