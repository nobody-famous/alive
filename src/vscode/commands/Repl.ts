import { homedir } from 'os'
import * as path from 'path'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { CompileFileNote, ExtensionState } from '../Types'
import { checkConnected, COMMON_LISP_ID, createFolder, getTempFolder, useEditor } from '../Utils'

const compilerDiagnostics = vscode.languages.createDiagnosticCollection('Compiler Diagnostics')

export async function refreshPackages(state: ExtensionState) {
    const pkgs = await state.backend?.listPackages()

    if (state.packageTree === undefined || pkgs === undefined) {
        return
    }

    state.packageTree.update(pkgs)
}

export async function refreshAsdfSystems(state: ExtensionState) {
    const systems = await state.backend?.listAsdfSystems()

    if (state.asdfTree === undefined || systems === undefined) {
        return
    }

    state.asdfTree.update(systems)
}

export async function refreshThreads(state: ExtensionState) {
    const threads = await state.backend?.listThreads()

    if (state.threadTree === undefined || threads === undefined) {
        return
    }

    state.threadTree.update(threads)
}

export async function loadAsdfSystem(state: ExtensionState) {
    checkConnected(state, async () => {
        const names = await state.backend?.listAsdfSystems()
        const name = await vscode.window.showQuickPick(names ?? [])

        if (typeof name !== 'string') {
            return
        }

        await vscode.workspace.saveAll()
        const resp = await state.backend?.loadAsdfSystem(name)

        if (resp === undefined) {
            return
        }

        await updateCompilerDiagnostics({}, resp.notes)
    })
}

export async function loadFile(state: ExtensionState) {
    useEditor([COMMON_LISP_ID], (editor: vscode.TextEditor) => {
        checkConnected(state, async () => {
            await editor.document.save()
            await state.backend?.loadFile(editor.document.uri.fsPath)

            refreshPackages(state)
            refreshAsdfSystems(state)
        })
    })
}

export async function compileFile(state: ExtensionState, useTemp: boolean, ignoreOutput: boolean = false) {
    useEditor([COMMON_LISP_ID], (editor: vscode.TextEditor) => {
        checkConnected(state, async () => {
            if (state.compileRunning) {
                return
            }

            try {
                state.compileRunning = true

                if (!useTemp) {
                    await editor.document.save()
                }

                const toCompile = useTemp ? await createTempFile(editor.document) : editor.document.fileName
                const resp = await state.backend?.compileFile(toCompile, ignoreOutput)

                if (resp !== undefined) {
                    const fileMap: { [index: string]: string } = {}

                    fileMap[toCompile] = editor.document.fileName
                    compilerDiagnostics.set(vscode.Uri.file(editor.document.fileName), [])

                    updateCompilerDiagnostics(fileMap, resp.notes)
                }
            } finally {
                state.compileRunning = false
            }
        })
    })
}

async function createTempFile(doc: vscode.TextDocument) {
    const dir = await getTempFolder()
    const faslDir = path.join(dir.fsPath, 'fasl')
    const fileName = path.join(faslDir, 'tmp.lisp')
    const content = new TextEncoder().encode(doc.getText())

    await createFolder(vscode.Uri.file(faslDir))
    await vscode.workspace.fs.writeFile(vscode.Uri.file(fileName), content)

    return fileName
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
        default:
            return vscode.DiagnosticSeverity.Error
    }
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

function getClSourceRegistryEnv(installPath: string, processEnv: NodeJS.ProcessEnv): { [key: string]: string | undefined } {
    const updatedEnv = { ...processEnv }

    if (!processEnv.CL_SOURCE_REGISTRY) {
        updatedEnv.CL_SOURCE_REGISTRY = installPath
        return updatedEnv
    }

    if (processEnv.CL_SOURCE_REGISTRY.startsWith('(')) {
        const pathSExpressionEnding = ` (:directory "${installPath}")`
        updatedEnv.CL_SOURCE_REGISTRY = `${processEnv.CL_SOURCE_REGISTRY.replace(/\)$/, pathSExpressionEnding)})`
        return updatedEnv
    }

    updatedEnv.CL_SOURCE_REGISTRY = `${processEnv.CL_SOURCE_REGISTRY}${path.delimiter}${installPath}`
    return updatedEnv
}

async function getWorkspaceOrFilePath(): Promise<string> {
    if (vscode.workspace.workspaceFolders === undefined) {
        return path.dirname(vscode.window.activeTextEditor?.document.fileName || homedir())
    }

    const folder =
        vscode.workspace.workspaceFolders.length > 1
            ? await pickWorkspaceFolder(vscode.workspace.workspaceFolders)
            : vscode.workspace.workspaceFolders[0]

    if (folder === undefined) {
        throw new Error('Failed to find a workspace folder')
    }

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
