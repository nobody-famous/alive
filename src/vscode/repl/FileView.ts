import * as path from 'path'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { View } from './View'

const OUTPUT_DIR = '.alive'
const REPL_FILE = 'cl.alive-repl'

export class FileView implements View {
    prompt: string = ''
    host: string
    port: number
    scheme: string
    name: string

    activeDoc?: vscode.TextDocument
    folder?: vscode.Uri
    replFile?: vscode.Uri
    replDoc?: vscode.TextDocument
    replEditor?: vscode.TextEditor

    constructor(host: string, port: number) {
        this.host = host
        this.port = port
        this.scheme = `cl-repl-${host}-${port}`
        this.name = `REPL ${this.host}:${this.port}`
    }

    async open() {
        try {
            this.getActiveDoc()
            this.getFolder()
            this.getReplFile()

            await this.createFolder()
            await this.openFile()
            await this.showDoc()
        } catch (err) {
            vscode.window.showErrorMessage(err)
        }
    }

    close() {}
    addLine(line: string) {}

    setPrompt(prompt: string) {
        if (this.replEditor === undefined) {
            return
        }

        const doc = this.replEditor.document

        this.replEditor.edit((builder: vscode.TextEditorEdit) => {
            const line = doc.lineAt(doc.lineCount - 1)
            let text = doc.lineCount === 0 ? '' : '\n'

            text += `${prompt}> `
            builder.insert(line.range.end, text)
        })

        doc.save()
    }

    async showDoc() {
        if (this.replDoc === undefined) {
            throw new Error('No REPL document')
        }

        this.replEditor = await vscode.window.showTextDocument(this.replDoc)
    }

    async openFile() {
        if (this.replFile === undefined) {
            throw new Error('No file to open')
        }

        this.replDoc = await this.tryOpen(this.replFile)

        if (this.replDoc !== undefined) {
            return
        }

        await this.tryCreate(this.replFile)
    }

    getReplFile() {
        if (this.folder === undefined) {
            throw new Error('No folder for REPL file')
        }

        this.replFile = vscode.Uri.joinPath(this.folder, REPL_FILE)
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
