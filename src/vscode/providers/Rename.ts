import * as vscode from 'vscode'

export function getRenameProvider(): vscode.RenameProvider {
    return {
        async provideRenameEdits(doc: vscode.TextDocument, pos: vscode.Position, newName: string): Promise<vscode.WorkspaceEdit> {
            console.log('Rename', newName)
            return new vscode.WorkspaceEdit()
        },
    }
}
