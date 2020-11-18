import * as path from 'path'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { jumpToBottom } from '../Utils'
import { View } from './View'

const OUTPUT_DIR = '.vscode/alive'

export class FileView implements View {
    prompt: string = ''
    host: string
    port: number
    scheme: string
    name: string
    needJump: boolean = true

    activeDoc?: vscode.TextDocument
    folder?: vscode.Uri
    replFile?: vscode.Uri
    replDoc?: vscode.TextDocument
    replEditor?: vscode.TextEditor

    constructor(host: string, port: number) {
        this.host = host
        this.port = port
        this.scheme = `cl-repl-${host}-${port}`
        this.name = `REPL-${this.host}-${this.port}.alive-repl`
    }

    async open() {
        try {
            this.getActiveDoc()
            this.getFolder()
            this.getReplFile()

            await this.createFolder()
            await this.openFile()
        } catch (err) {
            vscode.window.showErrorMessage(err)
        }
    }

    close() {}

    async show() {
        if (this.replDoc === undefined) {
            throw new Error('No REPL document')
        }

        if (!this.isEditorVisible()) {
            this.replEditor = await vscode.window.showTextDocument(this.replDoc, vscode.ViewColumn.Beside)
            this.needJump = true
        }
    }

    documentChanged() {
        if (this.needJump && this.replEditor !== undefined) {
            this.needJump = false
            jumpToBottom(this.replEditor)
        }
    }

    addText(text: string) {
        this.appendLine(`\n${text}\n${this.prompt}`)
    }

    setPrompt(prompt: string) {
        if (this.replEditor === undefined) {
            return
        }

        this.prompt = `${prompt}> `
        this.appendLine(this.prompt)
    }

    appendLine(toAppend: string) {
        if (this.replEditor === undefined) {
            return
        }

        const doc = this.replEditor.document

        this.replEditor.edit((builder: vscode.TextEditorEdit) => {
            const pos = doc.positionAt(Infinity)
            let text = doc.lineCount === 0 ? '' : '\n'

            this.replEditor!.selection = new vscode.Selection(pos, pos)

            text += toAppend
            builder.insert(pos, text)
        })

        doc.save()

        this.needJump = true
    }

    isEditorVisible(): boolean {
        if (this.replEditor === undefined) {
            return false
        }

        for (const editor of vscode.window.visibleTextEditors) {
            if (editor === this.replEditor) {
                return true
            }
        }

        return false
    }

    async openFile() {
        if (this.replFile === undefined) {
            throw new Error('No file to open')
        }

        try {
            this.replDoc = await this.tryOpen(this.replFile)
        } catch (err) {
            this.replDoc = await this.tryCreate(this.replFile)
        }
    }

    getReplFile() {
        if (this.folder === undefined) {
            throw new Error('No folder for REPL file')
        }

        this.replFile = vscode.Uri.joinPath(this.folder, this.name)
    }

    getFolder() {
        if (this.activeDoc === undefined) {
            throw new Error('No active document')
        }

        const wsFolder = vscode.workspace.getWorkspaceFolder(this.activeDoc.uri)

        if (wsFolder !== undefined) {
            this.folder = vscode.Uri.joinPath(wsFolder.uri, OUTPUT_DIR)
            return
        }

        const fsPath = this.activeDoc.uri.fsPath
        const dir = path.dirname(fsPath)

        this.folder = vscode.Uri.file(dir)
    }

    getActiveDoc() {
        this.activeDoc = vscode.window.activeTextEditor?.document

        if (this.activeDoc === undefined) {
            throw new Error(`No active document`)
        }
    }

    async createFolder() {
        if (this.folder === undefined) {
            throw new Error('No folder to create')
        }

        await vscode.workspace.fs.createDirectory(this.folder)
    }

    async tryCreate(path: vscode.Uri): Promise<vscode.TextDocument> {
        await vscode.workspace.fs.writeFile(path, new TextEncoder().encode(''))
        return await this.tryOpen(path)
    }

    async tryOpen(path: vscode.Uri): Promise<vscode.TextDocument> {
        return await vscode.workspace.openTextDocument(path)
    }
}