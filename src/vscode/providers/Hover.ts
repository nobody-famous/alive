import * as vscode from 'vscode'
import { ExtensionState } from '../Types'

export function getHoverProvider(state: ExtensionState): vscode.HoverProvider {
    return new Provider(state)
}

class Provider implements vscode.HoverProvider {
    private state: ExtensionState

    constructor(state: ExtensionState) {
        this.state = state
    }

    provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        return new vscode.Hover(this.state.hoverText)
    }
}
