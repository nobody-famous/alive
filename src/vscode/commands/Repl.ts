import { homedir } from 'os'
import * as path from 'path'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { CompileFileNote, ExtensionDeps, ExtensionState } from '../Types'
import { COMMON_LISP_ID, createFolder, getTempFolder, strToMarkdown, useEditor } from '../Utils'

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

            const toCompile = await createTempFile(editor.document)
            const resp = await deps.lsp.compileFile(toCompile)

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
