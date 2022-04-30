import * as path from 'path'
import * as vscode from 'vscode'
import * as cmds from './commands'
import { format, TextEncoder } from 'util'
import { homedir } from 'os'
import { refreshPackages } from './commands'
import { ExtensionState, HistoryItem } from './Types'

export const COMMON_LISP_ID = 'lisp'
export const REPL_ID = 'lisp-repl'

const OUTPUT_DIR = '.vscode/alive'

export function findEditorForDoc(doc: vscode.TextDocument): vscode.TextEditor | undefined {
    for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === doc) {
            return editor
        }
    }

    return undefined
}

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

export function selectHistoryItem(replHistory: HistoryItem[]) {
    return new Promise<HistoryItem>((resolve, reject) => {
        const items = [...replHistory]
        const qp = vscode.window.createQuickPick()

        qp.items = items.map<vscode.QuickPickItem>((i) => ({ label: i.text, description: i.pkgName }))

        qp.onDidChangeSelection(async (e) => {
            const item = e[0]

            if (item === undefined) {
                return
            }

            resolve({ text: item.label, pkgName: item.description ?? '' })

            qp.hide()
        })

        qp.onDidHide(() => qp.dispose())
        qp.show()
    })
}

export function xlatePath(filePath: string): string {
    const cfg = vscode.workspace.getConfiguration('alive')
    const wsFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))

    if (
        cfg.remoteWorkspace === undefined ||
        cfg.remoteWorkspace.trim() === '' ||
        wsFolder === undefined ||
        !filePath.startsWith(wsFolder.uri.fsPath)
    ) {
        return filePath
    }

    const wsPath = wsFolder.uri.fsPath
    const remote = cfg.remoteWorkspace

    const ndx = wsPath.endsWith('\\') ? wsPath.length : wsPath.length + 1
    const sep = remote.startsWith('/') ? '/' : path.sep
    const relativePath = filePath.slice(ndx)
    const parts = relativePath.split(path.sep)

    let remotePath = remote
    for (const part of parts) {
        remotePath += `${sep}${part}`
    }

    return remotePath
}

export function strToMarkdown(text: string): string {
    return text.replace(/ /g, '&nbsp;').replace(/\n/g, '  \n')
}

export function hasValidLangId(doc: vscode.TextDocument, ids: string[]): boolean {
    return ids.includes(doc.languageId)
}

export function isReplDoc(doc: vscode.TextDocument) {
    return doc.languageId === REPL_ID
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

export async function checkConnected(state: ExtensionState, fn: () => Promise<void>) {
    if (!state.backend?.isConnected()) {
        vscode.window.showErrorMessage('Not Connected')
        return
    }

    try {
        await fn()
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

export function getSelectionText(editor: vscode.TextEditor): string | undefined {
    if (editor.selection.isEmpty) {
        return undefined
    }

    const range = new vscode.Range(editor.selection.start, editor.selection.end)

    return editor.document.getText(range)
}

export async function getFilePosition(fileName: string, offset: number): Promise<vscode.Position | undefined> {
    try {
        const uri = vscode.Uri.file(fileName)
        const doc = await vscode.workspace.openTextDocument(uri.fsPath)

        return getDocPosition(doc, offset)
    } catch (err) {
        return undefined
    }
}

export async function getDocPosition(doc: vscode.TextDocument, offset: number): Promise<vscode.Position | undefined> {
    return doc.positionAt(offset)
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

export async function tryCreate(path: vscode.Uri): Promise<vscode.TextDocument> {
    await vscode.workspace.fs.writeFile(path, new TextEncoder().encode(''))
    return await tryOpen(path)
}

export async function tryOpen(path: vscode.Uri): Promise<vscode.TextDocument> {
    return await vscode.workspace.openTextDocument(path)
}

export async function openFile(file: vscode.Uri | undefined) {
    if (file === undefined) {
        throw new Error('No file to open')
    }

    try {
        return await tryOpen(file)
    } catch (err) {
        return await tryCreate(file)
    }
}

export function startCompileTimer(state: ExtensionState) {
    const cfg = vscode.workspace.getConfiguration('alive')
    const autoCompile = cfg.autoCompileOnType

    if (!state.backend?.isConnected() || !autoCompile) {
        return
    }

    if (state.compileTimeoutID !== undefined) {
        clearTimeout(state.compileTimeoutID)
        state.compileTimeoutID = undefined
    }

    state.compileTimeoutID = setTimeout(async () => {
        await cmds.compileFile(state, true, true)
        refreshPackages(state)
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
