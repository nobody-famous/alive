import * as path from 'path'
import * as vscode from 'vscode'
import * as cmds from './commands'

import { promises as fs } from 'fs'
import { homedir } from 'os'
import { TextEncoder, format } from 'util'
import { log, toLog } from '../vscode/Log'
import { isString } from './Guards'
import { CompileFileNote, CompileFileResp, CompileLocation, ExtensionState } from './Types'
import { UI } from './UI'
import { LSP } from './backend/LSP'

type VscodeDiags = Pick<vscode.DiagnosticCollection, 'set'>
type VscodeUri = Pick<vscode.Uri, 'fsPath'>
interface VscodeFolder {
    uri: VscodeUri
}

export const COMMON_LISP_ID = 'commonlisp'

export const parseToInt = (data: unknown): number | undefined => {
    if (typeof data !== 'string' && typeof data !== 'number') {
        return
    }

    const int = typeof data === 'string' ? Number(data) : data

    return Number.isInteger(int) ? int : undefined
}

export async function getWorkspaceOrFilePath(): Promise<string> {
    log(`Get workspace path: ${toLog(vscode.workspace.workspaceFolders)}`)

    if (!Array.isArray(vscode.workspace.workspaceFolders) || vscode.workspace.workspaceFolders.length === 0) {
        log('No workspace folders')

        const file = vscode.window.activeTextEditor?.document.fileName
        const outPath = isString(file) ? path.dirname(file) : homedir()

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

export async function dirExists(dir: string): Promise<boolean> {
    try {
        await fs.access(dir)

        return true
    } catch (err) {
        return false
    }
}

export async function findSubFolders(folders: readonly VscodeFolder[], sub: string[]): Promise<VscodeFolder[]> {
    const subs = []

    for (const folder of folders) {
        const subPath = path.join(folder.uri.fsPath, ...sub)
        if (await dirExists(subPath)) {
            subs.push(folder)
        }
    }

    return subs
}

export async function pickWorkspaceFolder(folders: readonly VscodeFolder[]): Promise<VscodeFolder | undefined> {
    try {
        log('Pick workspace folder')

        const haveVscodeFolder: VscodeFolder[] = await findSubFolders(folders, ['.vscode'])

        log(`Have .vscode folder: ${toLog(haveVscodeFolder)}`)

        if (haveVscodeFolder.length === 0) {
            log(`No .vscode folder found, returning ${toLog(folders[0])}`)

            return folders[0]
        }

        const haveAliveFolder: VscodeFolder[] = await findSubFolders(folders, ['.vscode', 'alive'])

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
    const html = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

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

export async function createFolder(folder: vscode.Uri) {
    await vscode.workspace.fs.createDirectory(folder)
}

export function diagnosticsEnabled() {
    const aliveConfig = vscode.workspace.getConfiguration('alive')
    return typeof aliveConfig?.enableDiagnostics === 'boolean' ? aliveConfig.enableDiagnostics : true
}

export function startCompileTimer(
    deps: {
        ui: Pick<UI, 'updatePackages'>
        lsp: Pick<LSP, 'tryCompileFile' | 'listPackages'>
    },
    state: {
        compileRunning: boolean
        compileTimeoutID: NodeJS.Timeout | undefined
        diagnostics: VscodeDiags
        workspacePath: string
    }
) {
    if (state.compileTimeoutID !== undefined) {
        clearTimeout(state.compileTimeoutID)
        state.compileTimeoutID = undefined
    }

    state.compileTimeoutID = setTimeout(async () => {
        await cmds.tryCompileFile(deps.lsp, state)
        await cmds.refreshPackages(deps)
    }, 500)
}

export async function tryCompile(
    state: Pick<ExtensionState, 'compileRunning' | 'workspacePath'>,
    lsp: Pick<LSP, 'tryCompileFile'>,
    doc: Pick<vscode.TextDocument, 'fileName' | 'getText'>
): Promise<CompileFileResp | void> {
    if (state.compileRunning) {
        return
    }

    try {
        state.compileRunning = true

        const toCompile = await createTempFile(state, doc)
        const resp = await lsp.tryCompileFile(toCompile)

        resp?.notes.forEach((note) => {
            if (note.location.file === toCompile) {
                note.location.file = doc.fileName
            }
        })

        return resp
    } finally {
        state.compileRunning = false
    }
}

export async function updateDiagnostics(diags: VscodeDiags, fileName: string, notes: CompileFileNote[]) {
    diags.set(vscode.Uri.file(fileName), [])
    updateCompilerDiagnostics(diags, notes)
}

export function getFolderPath(state: Pick<ExtensionState, 'workspacePath'>, subdir: string) {
    const dir = state.workspacePath
    return path.join(dir, subdir)
}

export async function createTempFile(state: Pick<ExtensionState, 'workspacePath'>, doc: Pick<vscode.TextDocument, 'getText'>) {
    const subdir = path.join('.vscode', 'alive', 'fasl')

    return await createFile(state, subdir, 'tmp.lisp', doc.getText())
}

export async function createFile(state: Pick<ExtensionState, 'workspacePath'>, subdir: string, name: string, content: string) {
    const folder = getFolderPath(state, subdir)
    const fileName = path.join(folder, name)

    await createFolder(vscode.Uri.file(folder))
    await vscode.workspace.fs.writeFile(vscode.Uri.file(fileName), new TextEncoder().encode(content))

    return fileName
}

export async function updateCompilerDiagnostics(diagnostics: VscodeDiags, notes: CompileFileNote[]) {
    const diags: { [index: string]: vscode.Diagnostic[] } = {}

    const createDiag = (location: CompileLocation, severity: string, message: string) => {
        return new vscode.Diagnostic(new vscode.Range(location.start, location.end), message, convertSeverity(severity))
    }

    for (const note of notes) {
        const fileName = note.location.file

        if (diags[fileName] === undefined) {
            diags[fileName] = []
        }

        diags[fileName].push(createDiag(note.location, note.severity, note.message))
    }

    for (const [file, arr] of Object.entries(diags)) {
        diagnostics.set(vscode.Uri.file(file), arr)
    }
}

export function convertSeverity(sev: string): vscode.DiagnosticSeverity {
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
