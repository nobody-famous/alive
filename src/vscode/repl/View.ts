import * as vscode from 'vscode'

export interface View {
    open(): void
    close(): void
    show(forceJump: boolean): void
    documentChanged(): void
    addText(line: string): void
    addTextAndPrompt(line: string): void
    setPrompt(prompt: string): void
    getViewColumn(): vscode.ViewColumn | undefined
}
