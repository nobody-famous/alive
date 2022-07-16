import * as vscode from 'vscode'
import { LSP } from '../backend/LSP'
import { ExtensionState } from '../Types'

export function getHoverProvider(state: ExtensionState, lsp: LSP): vscode.HoverProvider {
    return new Provider(state, lsp)
}

class Provider implements vscode.HoverProvider {
    private state: ExtensionState
    private lsp: LSP

    constructor(state: ExtensionState, lsp: LSP) {
        this.state = state
        this.lsp = lsp
    }

    async provideHover(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.Hover> {
        if (this.state.hoverText !== '') {
            return new vscode.Hover(this.state.hoverText)
        }

        let text = await this.lsp.getHoverText(doc.uri, pos)

        if (text !== '') {
            const symbol = await this.lsp.getSymbol(doc.uri, pos)
            const json = JSON.stringify(symbol)

            text += `<br>[Inspect](command:alive.inspect?${encodeURIComponent(json)})`
        }

        const mdString = new vscode.MarkdownString(text)

        mdString.supportHtml = true
        mdString.isTrusted = true

        return new vscode.Hover(mdString)
    }
}
