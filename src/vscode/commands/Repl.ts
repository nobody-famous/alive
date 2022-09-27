import * as path from 'path'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { CompileFileNote, ExtensionDeps, ExtensionState, LispSymbol } from '../Types'
import { COMMON_LISP_ID, createFolder, strToMarkdown, useEditor } from '../Utils'

const compilerDiagnostics = vscode.languages.createDiagnosticCollection('Compiler Diagnostics')

export function clearRepl(deps: ExtensionDeps) {
    deps.ui.clearRepl()
}

export async function sendToRepl(deps: ExtensionDeps) {
    const editor = vscode.window.activeTextEditor
    const info = await deps.lsp.getEvalInfo(editor)

    if (info !== undefined) {
        await vscode.workspace.saveAll()
        await deps.lsp.eval(info.text, info.package)
    }
}

export async function inlineEval(deps: ExtensionDeps, state: ExtensionState): Promise<void> {
    const editor = vscode.window.activeTextEditor
    const info = await deps.lsp.getEvalInfo(editor)

    if (editor === undefined || info === undefined) {
        return
    }

    const result = await deps.lsp.doEval(info.text, info.package)

    if (result === undefined) {
        return
    }

    state.hoverText = `=> ${strToMarkdown(result)}`
    await vscode.window.showTextDocument(editor.document, editor.viewColumn)
    vscode.commands.executeCommand('editor.action.showHover')
}

export async function selectSexpr(deps: ExtensionDeps) {
    const editor = vscode.window.activeTextEditor

    if (editor?.document === undefined) {
        return
    }

    const range = await deps.lsp.getTopExprRange(editor)

    if (range === undefined) {
        return
    }

    editor.selection = new vscode.Selection(range?.start, range?.end)
}

export async function refreshPackages(deps: ExtensionDeps) {
    const pkgs = await deps.lsp.listPackages()

    deps.ui.updatePackages(pkgs)
}

export async function refreshAsdfSystems(deps: ExtensionDeps) {
    const systems = await deps.lsp.listAsdfSystems()

    deps.ui.updateAsdfSystems(systems)
}

export async function refreshThreads(deps: ExtensionDeps) {
    const threads = await deps.lsp.listThreads()

    deps.ui.updateThreads(threads)
}

export async function loadAsdfSystem(deps: ExtensionDeps) {
    const names = await deps.lsp.listAsdfSystems()
    const name = await vscode.window.showQuickPick(names ?? [])

    if (typeof name !== 'string') {
        return
    }

    await vscode.workspace.saveAll()
    await deps.lsp.loadAsdfSystem(name)
}

export async function inspect(deps: ExtensionDeps, symbol: LispSymbol) {
    await deps.lsp.inspectSymbol(symbol)
}

export async function loadFile(deps: ExtensionDeps) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        await editor.document.save()
        await deps.lsp.loadFile(editor.document.uri.fsPath)

        refreshPackages(deps)
        refreshAsdfSystems(deps)
    })
}

export async function compileFile(deps: ExtensionDeps, state: ExtensionState) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        if (state.compileRunning) {
            return
        }

        try {
            state.compileRunning = true

            await vscode.workspace.saveAll()
            await deps.lsp.compileFile(editor.document.uri.fsPath)
        } finally {
            state.compileRunning = false
        }
    })
}

export async function tryCompileFile(deps: ExtensionDeps, state: ExtensionState) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        if (state.compileRunning) {
            return
        }

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
    })
}

export async function openScratchPad(state: ExtensionState) {
    const subdir = path.join('.vscode', 'alive')
    const folder = getFolderPath(state, subdir)
    const fileName = path.join(folder, 'scratch.lisp')

    // Make sure the folder exists
    await createFolder(vscode.Uri.file(folder))

    // Make sure the file exists
    const content = await readFileContent(fileName)
    await vscode.workspace.fs.writeFile(vscode.Uri.file(fileName), new TextEncoder().encode(content))

    // Open an editor with the file
    const doc = await vscode.workspace.openTextDocument(fileName)
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active)
}

function getFolderPath(state: ExtensionState, subdir: string) {
    const dir = state.workspacePath
    return path.join(dir, subdir)
}

async function readFileContent(path: string): Promise<string> {
    try {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(path))

        return content.toString()
    } catch (err) {
        return ''
    }
}
async function createFile(state: ExtensionState, subdir: string, name: string, content: string) {
    const folder = getFolderPath(state, subdir)
    const fileName = path.join(folder, name)

    await createFolder(vscode.Uri.file(folder))
    await vscode.workspace.fs.writeFile(vscode.Uri.file(fileName), new TextEncoder().encode(content))

    return fileName
}

async function createTempFile(state: ExtensionState, doc: vscode.TextDocument) {
    const subdir = path.join('.vscode', 'alive', 'fasl')

    return await createFile(state, subdir, 'tmp.lisp', doc.getText())
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
