import * as path from 'path'
import * as vscode from 'vscode'
import * as cmds from './commands'
import { TextEncoder } from 'util'
import { promises as fs } from 'fs'
import { format } from 'util'
import { homedir } from 'os'
import { refreshPackages } from './commands'
import { CompileFileNote, ExtensionDeps, ExtensionState } from './Types'
import { log, toLog } from '../vscode/Log'

const compilerDiagnostics = vscode.languages.createDiagnosticCollection('Compiler Diagnostics')

export const COMMON_LISP_ID = 'lisp'

export const parseToInt = (data: unknown): number | undefined => {
    if (typeof data !== 'string' && typeof data !== 'number') {
        return
    }

    const int = typeof data === 'string' ? parseInt(data) : data

    return Number.isFinite(int) ? int : undefined
}

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
    const html = str
        .replace(/&/g, '&amp;')
        .replace(/\</g, '&lt;')
        .replace(/\>/g, '&gt;')
        .replace(/ /g, '&nbsp;')
        .replace(/\n/g, '<br>')

    return html
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

export function diagnosticsEnabled() {
    const aliveConfig = vscode.workspace.getConfiguration('alive')
    return typeof aliveConfig.enableDiagnostics === 'boolean' ? aliveConfig.enableDiagnostics : true
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

export async function updateDiagnostics(deps: ExtensionDeps, state: ExtensionState, editor: vscode.TextEditor) {
    try {
        state.compileRunning = true

        const toCompile = await createTempFile(state, editor.document)
        const resp = await deps.lsp.tryCompileFile(toCompile)

        if (resp === undefined) {
            return
        }

        const fileMap: { [index: string]: string } = {}

        fileMap[toCompile] = editor.document.fileName
        compilerDiagnostics.set(vscode.Uri.file(editor.document.fileName), [])

        updateCompilerDiagnostics(fileMap, resp.notes)
    } finally {
        state.compileRunning = false
    }
}

export function getFolderPath(state: ExtensionState, subdir: string) {
    const dir = state.workspacePath
    return path.join(dir, subdir)
}

async function createTempFile(state: ExtensionState, doc: vscode.TextDocument) {
    const subdir = path.join('.vscode', 'alive', 'fasl')

    return await createFile(state, subdir, 'tmp.lisp', doc.getText())
}

async function createFile(state: ExtensionState, subdir: string, name: string, content: string) {
    const folder = getFolderPath(state, subdir)
    const fileName = path.join(folder, name)

    await createFolder(vscode.Uri.file(folder))
    await vscode.workspace.fs.writeFile(vscode.Uri.file(fileName), new TextEncoder().encode(content))

    return fileName
}

async function updateCompilerDiagnostics(fileMap: { [index: string]: string }, notes: CompileFileNote[]) {
    const diags: { [index: string]: vscode.Diagnostic[] } = {}

    for (const note of notes) {
        const notesFile = note.location.file.replace(/\//g, path.sep)
        const fileName = fileMap[notesFile] ?? note.location.file

        const doc = await vscode.workspace.openTextDocument(fileName)
        const startPos = note.location.start
        const endPos = note.location.end

        if (diags[fileName] === undefined) {
            diags[fileName] = []
        }

        const diag = new vscode.Diagnostic(new vscode.Range(startPos, endPos), note.message, convertSeverity(note.severity))
        diags[fileName].push(diag)
    }

    for (const [file, arr] of Object.entries(diags)) {
        compilerDiagnostics.set(vscode.Uri.file(file), arr)
    }
}

function convertSeverity(sev: string): vscode.DiagnosticSeverity {
    switch (sev) {
        case 'error':
        case 'read_error':
            return vscode.DiagnosticSeverity.Error
        case 'note':
        case 'redefinition':
        case 'style_warning':
        case 'warning':
            return vscode.DiagnosticSeverity.Warning
        case 'info':
            return vscode.DiagnosticSeverity.Information
        default:
            return vscode.DiagnosticSeverity.Error
    }
}
