import * as path from 'path'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { log } from '../Log'
import { ExtensionDeps, ExtensionState, LispSymbol } from '../Types'
import { COMMON_LISP_ID, createFolder, getFolderPath, strToMarkdown, tryCompile, updateDiagnostics, useEditor } from '../Utils'
import { LSP } from '../backend/LSP'
import { UI } from '../UI'

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

export async function refreshPackages(deps: { ui: Pick<UI, 'updatePackages'>; lsp: Pick<LSP, 'listPackages'> }) {
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

export async function inspectMacro(deps: ExtensionDeps) {
    const editor = vscode.window.activeTextEditor
    const info = await deps.lsp.getMacroInfo(editor)

    if (info !== undefined) {
        await vscode.workspace.saveAll()
        await deps.lsp.inspectMacro(info.text, info.package)
    }
}

export async function loadFile(deps: ExtensionDeps) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        await editor.document.save()
        await deps.lsp.loadFile(editor.document.uri.fsPath)
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

export async function tryCompileFile(
    lsp: Pick<LSP, 'tryCompileFile'>,
    state: {
        compileRunning: boolean
        diagnostics: Pick<vscode.DiagnosticCollection, 'set'>
        workspacePath: string
    }
) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        const resp = await tryCompile(state, lsp, editor.document)

        if (resp !== undefined) {
            await updateDiagnostics(state.diagnostics, editor.document.fileName, resp.notes)
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

async function doMacroExpand(deps: ExtensionDeps, fn: (text: string, pkg: string) => Promise<string | undefined>) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        const info = await deps.lsp.getMacroInfo(editor)

        if (info === undefined) {
            return
        }

        try {
            const newText = await fn(info?.text, info?.package)

            if (typeof newText === 'string') {
                editor.edit((builder) => builder.replace(info.range, newText))
            }
        } catch (err) {
            log('Failed to expand macro: ${err}')
        }
    })
}

export async function macroexpand(deps: ExtensionDeps, state: ExtensionState) {
    await doMacroExpand(deps, deps.lsp.macroexpand)
}

export async function macroexpand1(deps: ExtensionDeps, state: ExtensionState) {
    await doMacroExpand(deps, deps.lsp.macroexpand1)
}

async function readFileContent(path: string): Promise<string> {
    try {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(path))

        return content.toString()
    } catch (err) {
        return ''
    }
}
