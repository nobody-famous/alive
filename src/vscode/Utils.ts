import * as path from 'path'
import * as vscode from 'vscode'
import * as cmds from './commands'
import { promises as fs } from 'fs'
import { format } from 'util'
import { homedir } from 'os'
import { refreshPackages } from './commands'
import { ExtensionDeps, ExtensionState } from './Types'
import { log, toLog } from '../vscode/Log'

export const COMMON_LISP_ID = 'lisp'

export async function getWorkspaceOrFilePath(): Promise<string> {
    log(`Get workspace path: ${toLog(vscode.workspace.workspaceFolders)}`)

    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        log(`No workspace folders`)

        const outPath = path.dirname(vscode.window.activeTextEditor?.document.fileName || homedir())

        log(`Using ${outPath}`)

        return outPath
    }

    const folder =
        vscode.workspace.workspaceFolders.length > 1
            ? await pickWorkspaceFolder(vscode.workspace.workspaceFolders)
            : vscode.workspace.workspaceFolders[0]

    log(`Workspace folder: ${toLog(folder)}`)

    return folder.uri.fsPath
}

async function pickWorkspaceFolder(folders: readonly vscode.WorkspaceFolder[]): Promise<vscode.WorkspaceFolder> {
    try {
        log(`Pick workspace folder`)

        const dirExists = async (dir: string): Promise<boolean> => {
            try {
                await fs.access(dir)

                return true
            } catch (err) {
                return false
            }
        }

        const haveVscodeFolder: vscode.WorkspaceFolder[] = []

        for (const folder of folders) {
            const folderPath = folder.uri.fsPath
            const vscodePath = path.join(folderPath, '.vscode')
            const exists = await dirExists(vscodePath)

            if (exists) {
                haveVscodeFolder.push(folder)
            }
        }

        log(`Have .vscode folder: ${toLog(haveVscodeFolder)}`)

        if (haveVscodeFolder.length === 0) {
            log(`No .vscode folder found, returning ${toLog(folders[0])}`)

            return folders[0]
        }

        const haveAliveFolder: vscode.WorkspaceFolder[] = []

        for (const folder of haveVscodeFolder) {
            const folderPath = folder.uri.fsPath
            const alivePath = path.join(folderPath, '.vscode', 'alive')
            const exists = await dirExists(alivePath)

            if (exists) {
                haveAliveFolder.push(folder)
            }
        }

        log(`Have .vscode/alive folder: ${toLog(haveAliveFolder)}`)

        if (haveAliveFolder.length === 0) {
            log(`No .vscode/alive folder, retuning ${toLog(haveVscodeFolder[0])}`)

            return haveVscodeFolder[0]
        }

        log(`Found .vscode/alive folder at ${toLog(haveAliveFolder[0])}`)

        return haveAliveFolder[0]
    } catch (err) {
        log(`Failed to pick folder: ${err}`)
        throw err
    }
}

export function strToMarkdown(text: string): string {
    return text.replace(/ /g, '&nbsp;').replace(/\n/g, '  \n')
}

export function strToHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/ /g, '&nbsp;').replace(/\</g, '&lt;').replace(/\>/g, '&gt;').replace(/\n/g, '<br>')
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
        await cmds.tryCompileFile(deps, state)
        refreshPackages(deps)
    }, 500)
}
