import { format } from 'util'
import * as vscode from 'vscode'
import * as Skeleton from '../SystemSkeleton'

export async function systemSkeleton() {
    const folders = vscode.workspace.workspaceFolders

    if (folders === undefined) {
        vscode.window.showErrorMessage('No open folders')
        return
    }

    const folder = folders.length > 1 ? await pickFolder(folders) : folders[0]
    if (folder === undefined) {
        return
    }

    try {
        await Skeleton.create(folder)
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

async function pickFolder(folders: readonly vscode.WorkspaceFolder[]): Promise<vscode.WorkspaceFolder | undefined> {
    const nameMap: { [index: string]: vscode.WorkspaceFolder | undefined } = {}

    for (const folder of folders) {
        nameMap[folder.uri.fsPath] = folder
    }

    const pick = await vscode.window.showQuickPick(Object.keys(nameMap), { placeHolder: 'Select folder' })

    if (pick === undefined) {
        return undefined
    }

    return nameMap[pick]
}
