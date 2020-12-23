import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { Expr, findAtom, findExpr, findInnerExpr, Lexer, Parser, types } from '../lisp'

export const COMMON_LISP_ID = 'lisp'
export const REPL_ID = 'lisp-repl'

const OUTPUT_DIR = '.vscode/alive'

export function hasValidLangId(doc: vscode.TextDocument, ids: string[]): boolean {
    return ids.includes(doc.languageId)
}

export function toVscodePos(pos: types.Position): vscode.Position {
    return new vscode.Position(pos.line, pos.character)
}

export function isReplDoc(doc: vscode.TextDocument) {
    return doc.languageId === REPL_ID
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

export async function getTempFolder() {
    let baseFolder = await getOpenFolder()

    if (baseFolder === undefined) {
        baseFolder = getActiveDocFolder()
    }

    if (baseFolder === undefined) {
        throw new Error('No folder for REPL file')
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

    return wsFolder?.uri
}
