import * as path from 'path'
import * as vscode from 'vscode'
import * as cmds from './commands'
import { format } from 'util'
import { homedir } from 'os'
import { refreshPackages } from './commands'
import { ExtensionDeps, ExtensionState } from './Types'

export const COMMON_LISP_ID = 'lisp'

const OUTPUT_DIR = '.vscode/alive'

export async function getWorkspaceOrFilePath(): Promise<string> {
    if (vscode.workspace.workspaceFolders === undefined) {
        return path.dirname(vscode.window.activeTextEditor?.document.fileName || homedir())
    }

    const folder =
        vscode.workspace.workspaceFolders.length > 1
            ? await pickWorkspaceFolder(vscode.workspace.workspaceFolders)
            : vscode.workspace.workspaceFolders[0]

    return folder.uri.fsPath
}

export async function getWorkspacePath(): Promise<string | undefined> {
    if (vscode.workspace.workspaceFolders === undefined) {
        return undefined
    }

    const folder =
        vscode.workspace.workspaceFolders.length > 1
            ? await pickWorkspaceFolder(vscode.workspace.workspaceFolders)
            : vscode.workspace.workspaceFolders[0]

    return folder.uri.fsPath
}

async function pickWorkspaceFolder(folders: readonly vscode.WorkspaceFolder[]): Promise<vscode.WorkspaceFolder> {
    const addFolderToFolders = (folders: { [key: string]: vscode.WorkspaceFolder }, folder: vscode.WorkspaceFolder) => {
        folders[folder.uri.fsPath] = folder
        return folders
    }

    const namedFolders = folders.reduce(addFolderToFolders, {})
    const folderNames = Object.keys(namedFolders)
    const chosenFolder = await vscode.window.showQuickPick(folderNames, { placeHolder: 'Select folder' })

    if (chosenFolder === undefined) {
        throw new Error('Failed to choose a folder name')
    }

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

export async function getTempFolder() {
    let baseFolder = await getOpenFolder()

    if (baseFolder === undefined) {
        baseFolder = getActiveDocFolder()
    }

    if (baseFolder === undefined) {
        throw new Error('No folder for REPL file, is file saved to disk?')
    }

    return vscode.Uri.joinPath(baseFolder, OUTPUT_DIR)
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

async function getOpenFolder() {
    const folders = vscode.workspace.workspaceFolders

    if (folders === undefined) {
        return undefined
    }

    const uriMap: { [index: string]: vscode.WorkspaceFolder | undefined } = {}

    for (const folder of folders) {
        uriMap[folder.uri.fsPath] = folder
    }

    let openFolder: vscode.Uri | undefined = undefined

    if (folders.length > 1) {
        const pick = await vscode.window.showQuickPick(Object.keys(uriMap), { placeHolder: 'Select folder' })

        if (pick !== undefined) {
            openFolder = uriMap[pick]?.uri
        }
    } else {
        openFolder = folders[0].uri
    }

    return openFolder
}

function getActiveDocFolder() {
    const activeDoc = vscode.window.activeTextEditor?.document

    if (activeDoc === undefined) {
        return undefined
    }

    const wsFolder = vscode.workspace.getWorkspaceFolder(activeDoc.uri)
    if (wsFolder !== undefined) {
        return wsFolder.uri
    }

    const docPath = path.parse(activeDoc.uri.path)

    if (docPath.dir === '') {
        return undefined
    }

    return vscode.Uri.file(docPath.dir)
}
