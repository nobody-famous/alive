import { EOL } from 'os'
import * as vscode from 'vscode'
import { createFolder, getTempFolder, jumpToBottom, openFile } from '../Utils'
import { View } from './View'

export class FileView implements View {
    prompt: string = ''
    host: string
    port: number
    scheme: string
    name: string
    needJump: boolean = true

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
            this.folder = await getTempFolder()

            if (this.folder === undefined) {
                throw new Error('No folder for REPL file')
            }

            this.replFile = vscode.Uri.joinPath(this.folder, this.name)

            await createFolder(this.folder)

            this.replDoc = await openFile(this.replFile)
        } catch (err) {
            vscode.window.showErrorMessage(err)
        }
    }

    close() {}

    getViewColumn() {
        return this.replEditor?.viewColumn
    }

    async show() {
        if (this.replDoc === undefined) {
            throw new Error('No REPL document')
        }

        if (!this.isEditorVisible()) {
            const column = vscode.ViewColumn.Two
            this.replEditor = await vscode.window.showTextDocument(this.replDoc, column, true)
            jumpToBottom(this.replEditor)
        }
    }

    documentChanged() {
        if (this.needJump && this.replEditor !== undefined) {
            this.needJump = false
            jumpToBottom(this.replEditor)
        }
    }

    async addText(text: string) {
        await this.show()
        await this.appendLine(`${EOL}${text}`)
    }

    async addTextAndPrompt(text: string) {
        await this.show()
        await this.appendLine(`${EOL}${text}${EOL}${this.prompt}`)
    }

    setPrompt(prompt: string) {
        if (this.replEditor === undefined) {
            return
        }

        this.prompt = `${prompt}> `
        this.appendLine(this.prompt)
    }

    private async appendLine(toAppend: string) {
        if (this.replEditor === undefined || !this.isEditorVisible()) {
            vscode.window.showWarningMessage(`REPL not visible for ${toAppend}`)
            return
        }

        const doc = this.replEditor.document

        this.needJump = true
        this.replEditor.edit((builder: vscode.TextEditorEdit) => {
            const pos = doc.positionAt(Infinity)
            let text = doc.lineCount === 0 ? '' : EOL

            this.replEditor!.selection = new vscode.Selection(pos, pos)

            text += toAppend
            builder.insert(pos, text)
        })

        await doc.save()
    }

    private isEditorVisible(): boolean {
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
}
