import * as path from 'path'
import { TextEncoder, format } from 'util'
import * as vscode from 'vscode'
import { ExtensionState, LispSymbol } from '../Types'
import { UI } from '../UI'
import { COMMON_LISP_ID, createFolder, getFolderPath, strToMarkdown, tryCompile, updateDiagnostics, useEditor } from '../Utils'
import { LSP } from '../backend/LSP'

export function clearRepl(ui: Pick<UI, 'clearRepl'>) {
    ui.clearRepl()
}

export async function sendToRepl(lsp: Pick<LSP, 'getEvalInfo' | 'evalWithOutput'>) {
    useEditor([COMMON_LISP_ID], async (editor) => {
        const info = await lsp.getEvalInfo(editor.document.getText, editor.document.uri.toString(), editor.selection)

        if (info !== undefined) {
            await vscode.workspace.saveAll()
            await lsp.evalWithOutput(info.text, info.package)
        }
    })
}

export async function inlineEval(
    lsp: Pick<LSP, 'getEvalInfo' | 'eval'>,
    state: Pick<ExtensionState, 'hoverText'>
): Promise<void> {
    useEditor([COMMON_LISP_ID], async (editor) => {
        const info = await lsp.getEvalInfo(editor.document.getText, editor.document.uri.toString(), editor.selection)

        if (info === undefined) {
            return
        }

        const result = await lsp.eval(info.text, info.package)

        if (result === undefined) {
            return
        }

        state.hoverText = `=> ${strToMarkdown(result)}`
        await vscode.window.showTextDocument(editor.document, editor.viewColumn)
        vscode.commands.executeCommand('editor.action.showHover')
    })
}

export async function selectSexpr(lsp: Pick<LSP, 'getTopExprRange'>) {
    useEditor([COMMON_LISP_ID], async (editor) => {
        const range = await lsp.getTopExprRange(editor.document.uri.toString(), editor.selection)

        if (range === undefined) {
            return
        }

        editor.selection = new vscode.Selection(range?.start, range?.end)
    })
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
        const info = await lsp.getMacroInfo(editor.document.getText, editor.document.uri.toString(), editor.selection)

        if (info === undefined) {
            return
        }

        await vscode.workspace.saveAll()
        await lsp.inspectMacro(info.text, info.package)
    })
}

export function loadFile(lsp: Pick<LSP, 'loadFile'>) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        await editor.document.save()
        await lsp.loadFile(editor.document.uri.fsPath)
    })
}

export function compileFile(lsp: Pick<LSP, 'compileFile'>, state: Pick<ExtensionState, 'compileRunning'>) {
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

export function tryCompileWithDiags(
    lsp: Pick<LSP, 'tryCompileFile'>,
    state: Pick<ExtensionState, 'compileRunning' | 'diagnostics' | 'workspacePath'>
) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        const resp = await tryCompile(state, lsp, editor.document)

        if (resp !== undefined) {
            await updateDiagnostics(state.diagnostics, editor.document.fileName, resp.notes)
        }
    })
}

export async function openScratchPad(state: Pick<ExtensionState, 'workspacePath'>) {
    const subdir = path.join('.vscode', 'alive')
    const folder = getFolderPath(state, subdir)
    const fileName = path.join(folder, 'scratch.lisp')

    try {
        // Make sure the folder exists
        await createFolder(vscode.Uri.file(folder))

        // Make sure the file exists
        const content = await readFileContent(fileName)
        await vscode.workspace.fs.writeFile(vscode.Uri.file(fileName), new TextEncoder().encode(content))

        // Open an editor with the file
        const doc = await vscode.workspace.openTextDocument(fileName)
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active)
    } catch (err) {
        vscode.window.showErrorMessage(format(err))
    }
}

export function macroexpand(lsp: Pick<LSP, 'macroexpand' | 'getMacroInfo'>) {
    doMacroExpand(lsp, lsp.macroexpand)
}

export function macroexpand1(lsp: Pick<LSP, 'macroexpand1' | 'getMacroInfo'>) {
    doMacroExpand(lsp, lsp.macroexpand1)
}

function doMacroExpand(lsp: Pick<LSP, 'getMacroInfo'>, fn: (text: string, pkg: string) => Promise<string | undefined>) {
    useEditor([COMMON_LISP_ID], async (editor: vscode.TextEditor) => {
        const info = await lsp.getMacroInfo(editor.document.getText, editor.document.uri.toString(), editor.selection)

        if (info === undefined) {
            return
        }

        const newText = await fn(info?.text, info?.package)

        if (typeof newText === 'string') {
            editor.edit((builder) => builder.replace(info.range, newText))
        }
    })
}

async function readFileContent(path: string): Promise<string> {
    try {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(path))

        return content.toString()
    } catch (err) {
        return ''
    }
}
