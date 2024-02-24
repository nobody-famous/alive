import * as path from 'path'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { log } from '../Log'
import { ExtensionState, LispSymbol } from '../Types'
import { COMMON_LISP_ID, createFolder, getFolderPath, strToMarkdown, tryCompile, updateDiagnostics, useEditor } from '../Utils'
import { LSP } from '../backend/LSP'
import { UI } from '../UI'

export function clearRepl(ui: Pick<UI, 'clearRepl'>) {
    ui.clearRepl()
}

export async function sendToRepl(lsp: Pick<LSP, 'getEvalInfo' | 'eval'>) {
    const editor = vscode.window.activeTextEditor
    const info = await lsp.getEvalInfo(editor)

    if (info !== undefined) {
        await vscode.workspace.saveAll()
        await lsp.eval(info.text, info.package)
    }
}

export async function inlineEval(lsp: Pick<LSP, 'getEvalInfo' | 'doEval'>, state: ExtensionState): Promise<void> {
    const editor = vscode.window.activeTextEditor
    const info = await lsp.getEvalInfo(editor)

    if (editor === undefined || info === undefined) {
        return
    }

    const result = await lsp.doEval(info.text, info.package)

    if (result === undefined) {
        return
    }

    state.hoverText = `=> ${strToMarkdown(result)}`
    await vscode.window.showTextDocument(editor.document, editor.viewColumn)
    vscode.commands.executeCommand('editor.action.showHover')
}

export async function selectSexpr(lsp: Pick<LSP, 'getTopExprRange'>) {
    const editor = vscode.window.activeTextEditor

    if (editor?.document === undefined) {
        return
    }

    const range = await lsp.getTopExprRange(editor)

    if (range === undefined) {
        return
    }

    editor.selection = new vscode.Selection(range?.start, range?.end)
}

export async function refreshPackages(ui: Pick<UI, 'updatePackages'>, lsp: Pick<LSP, 'listPackages'>) {
    const pkgs = await lsp.listPackages()

    ui.updatePackages(pkgs)
}

export async function refreshAsdfSystems(ui: Pick<UI, 'updateAsdfSystems'>, lsp: Pick<LSP, 'listAsdfSystems'>) {
    const systems = await lsp.listAsdfSystems()

    ui.updateAsdfSystems(systems)
}

export async function refreshThreads(ui: Pick<UI, 'updateThreads'>, lsp: Pick<LSP, 'listThreads'>) {
    const threads = await lsp.listThreads()

    ui.updateThreads(threads)
}

export async function loadAsdfSystem(lsp: Pick<LSP, 'listAsdfSystems' | 'loadAsdfSystem'>) {
    const names = await lsp.listAsdfSystems()
    const name = await vscode.window.showQuickPick(names ?? [])

    if (typeof name !== 'string') {
        return
    }

    await vscode.workspace.saveAll()
    await lsp.loadAsdfSystem(name)
}

export async function inspect(lsp: Pick<LSP, 'inspectSymbol'>, symbol: LispSymbol) {
    await lsp.inspectSymbol(symbol)
}

export async function inspectMacro(lsp: Pick<LSP, 'getMacroInfo' | 'inspectMacro'>) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        const info = await lsp.getMacroInfo(editor)

        if (info === undefined) {
            return
        }

        await vscode.workspace.saveAll()
        await lsp.inspectMacro(info.text, info.package)
    })
}

export async function loadFile(lsp: Pick<LSP, 'loadFile'>) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        await editor.document.save()
        await lsp.loadFile(editor.document.uri.fsPath)
    })
}

export async function compileFile(lsp: Pick<LSP, 'compileFile'>, state: ExtensionState) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        if (state.compileRunning) {
            return
        }

        try {
            state.compileRunning = true

            await vscode.workspace.saveAll()
            await lsp.compileFile(editor.document.uri.fsPath)
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

async function doMacroExpand(lsp: Pick<LSP, 'getMacroInfo'>, fn: (text: string, pkg: string) => Promise<string | undefined>) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        const info = await lsp.getMacroInfo(editor)

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

export async function macroexpand(lsp: Pick<LSP, 'macroexpand' | 'getMacroInfo'>) {
    await doMacroExpand(lsp, lsp.macroexpand)
}

export async function macroexpand1(lsp: Pick<LSP, 'macroexpand1' | 'getMacroInfo'>) {
    await doMacroExpand(lsp, lsp.macroexpand1)
}

async function readFileContent(path: string): Promise<string> {
    try {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(path))

        return content.toString()
    } catch (err) {
        return ''
    }
}
