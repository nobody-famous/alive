import * as path from 'path'
import { format, TextEncoder } from 'util'
import * as vscode from 'vscode'
import { Expr, findAtom, findExpr, findInnerExpr, Lexer, Parser, types } from '../lisp'
import * as cmds from './commands'
import { refreshPackages } from './commands'
import { ExtensionState } from './Types'

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

export function toVscodePos(pos: types.Position): vscode.Position {
    return new vscode.Position(pos.line, pos.character)
}

export function samePosition(pos1: types.Position, pos2: types.Position): boolean {
    return pos1.line === pos2.line && pos1.character === pos2.character
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

export function getDocumentExprs(doc: vscode.TextDocument) {
    const lex = new Lexer(doc.getText())
    const tokens = lex.getTokens()
    const parser = new Parser(tokens)
    const exprs = parser.parse()

    return exprs
}

export function getExprRange(editor: vscode.TextEditor, expr: Expr): vscode.Range {
    const selection = editor.selection

    if (!selection.isEmpty) {
        return new vscode.Range(selection.start, selection.end)
    }

    return new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))
}

export function getSelectionText(editor: vscode.TextEditor): string | undefined {
    if (editor.selection.isEmpty) {
        return undefined
    }

    const range = new vscode.Range(editor.selection.start, editor.selection.end)

    return editor.document.getText(range)
}

export function getExprText(editor: vscode.TextEditor, pos: vscode.Position): string | undefined {
    const expr = getTopExpr(editor.document, pos)

    if (expr === undefined) {
        return undefined
    }

    const range = new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))

    return editor.document.getText(range)
}

export function getInnerExprText(doc: vscode.TextDocument, pos: vscode.Position): string | undefined {
    const expr = getInnerExpr(doc, pos)

    if (expr === undefined) {
        return undefined
    }

    const range = new vscode.Range(toVscodePos(expr.start), toVscodePos(expr.end))

    return doc.getText(range)
}

export function getSelectOrExpr(editor: vscode.TextEditor, pos: vscode.Position): string | undefined {
    let text = getSelectionText(editor)

    if (text === undefined) {
        text = getExprText(editor, pos)
    }

    return text
}

export function getTopExpr(doc: vscode.TextDocument, pos: vscode.Position) {
    const exprs = getDocumentExprs(doc)
    const expr = findExpr(exprs, pos)

    if (expr === undefined || expr.start === undefined || expr.end === undefined) {
        return undefined
    }

    return expr
}

export function getInnerExpr(doc: vscode.TextDocument, pos: vscode.Position): Expr | undefined {
    const exprs = getDocumentExprs(doc)
    let expr = findInnerExpr(exprs, pos)

    if (expr !== undefined) {
        return expr
    }

    return findAtom(exprs, pos)
}

export function jumpToBottom(editor: vscode.TextEditor) {
    const pos = editor.document.positionAt(Infinity)

    editor.selection = new vscode.Selection(pos, pos)
    editor.revealRange(new vscode.Range(pos, pos))
}

export function jumpToTop(editor: vscode.TextEditor) {
    const pos = editor.document.positionAt(0)

    editor.selection = new vscode.Selection(pos, pos)
    editor.revealRange(new vscode.Range(pos, pos))
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
