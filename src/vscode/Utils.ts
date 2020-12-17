import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { Lexer, Parser, types } from '../lisp'

export const COMMON_LISP_ID = 'lisp'
export const REPL_ID = 'lisp-repl'

const OUTPUT_DIR = '.vscode/alive'

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
