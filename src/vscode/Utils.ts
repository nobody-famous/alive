import * as path from 'path'
import * as vscode from 'vscode'
import * as cmds from './commands'
import { format } from 'util'
import { homedir } from 'os'
import { refreshPackages } from './commands'
import { ExtensionDeps, ExtensionState } from './Types'
import { log, toLog } from '../vscode/Log'

export const COMMON_LISP_ID = 'lisp'

const OUTPUT_DIR = '.vscode/alive'

export async function getWorkspaceOrFilePath(): Promise<string> {
    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        return path.dirname(vscode.window.activeTextEditor?.document.fileName || homedir())
    }

    const folder =
        vscode.workspace.workspaceFolders.length > 1
            ? await pickWorkspaceFolder(vscode.workspace.workspaceFolders)
            : vscode.workspace.workspaceFolders[0]

    return folder.uri.fsPath
}

export async function getWorkspacePath(): Promise<string | undefined> {
    log(`Get workspace path: ${toLog(vscode.workspace.workspaceFolders)}`)

    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        return undefined
    }

    const folder =
        vscode.workspace.workspaceFolders.length > 1
            ? await pickWorkspaceFolder(vscode.workspace.workspaceFolders)
            : vscode.workspace.workspaceFolders[0]

    log(`Workspace folder: ${toLog(folder)}`)

    return folder.uri.fsPath
}

async function pickWorkspaceFolder(folders: readonly vscode.WorkspaceFolder[]): Promise<vscode.WorkspaceFolder> {
    const addFolderToFolders = (folders: { [key: string]: vscode.WorkspaceFolder }, folder: vscode.WorkspaceFolder) => {
        folders[folder.uri.fsPath] = folder
        return folders
    }

    const namedFolders = folders.reduce(addFolderToFolders, {})
    const folderNames = Object.keys(namedFolders)

    log(`Folder names: ${toLog(folderNames)}`)

    const chosenFolder = await vscode.window.showQuickPick(folderNames, { placeHolder: 'Select folder' })

    log(`Chosen folder: ${toLog(chosenFolder)}`)

    if (chosenFolder === undefined) {
        throw new Error('Failed to choose a folder name')
    }

    log(`Chosen workspace folder: ${toLog(namedFolders[chosenFolder])}`)

    return namedFolders[chosenFolder]
}

export function strToMarkdown(text: string): string {
    return text.replace(/ /g, '&nbsp;').replace(/\n/g, '  \n')
}

export function hasValidLangId(doc: vscode.TextDocument, ids: string[]): boolean {
    return ids.includes(doc.languageId)
}

export async function useEditor(ids: string[], fn: (editor: vscode.TextEditor) => void) {
    const editor = vscode.window.activeTextEditor

    if (editor === undefined || !hasValidLangId(editor.document, ids)) {
        return
    }

    try {
        fn(editor)
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

export async function createFolder(folder: vscode.Uri | undefined) {
    if (folder === undefined) {
        throw new Error('No folder to create')
    }

    await vscode.workspace.fs.createDirectory(folder)
}

export function startCompileTimer(deps: ExtensionDeps, state: ExtensionState) {
    if (state.compileTimeoutID !== undefined) {
        clearTimeout(state.compileTimeoutID)
        state.compileTimeoutID = undefined
    }

    state.compileTimeoutID = setTimeout(async () => {
        await cmds.compileFile(deps, state)
        refreshPackages(deps)
    }, 500)
}
