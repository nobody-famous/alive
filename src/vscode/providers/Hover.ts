import * as vscode from 'vscode'
import { LSP } from '../backend/LSP'
import { ExtensionState } from '../Types'

type HoverState = Pick<ExtensionState, 'hoverText'>
type HoverLSP = Pick<LSP, 'getHoverText' | 'getSymbol'>

export function getHoverProvider(state: HoverState, lsp: HoverLSP): Provider {
    return new Provider(state, lsp)
}

class Provider implements vscode.HoverProvider {
    private state: HoverState
    private lsp: HoverLSP

    constructor(state: HoverState, lsp: HoverLSP) {
        this.state = state
        this.lsp = lsp
    }

    async provideHover(doc: Pick<vscode.TextDocument, 'uri'>, pos: vscode.Position): Promise<vscode.Hover> {
        if (this.state.hoverText !== '') {
            return new vscode.Hover(new vscode.MarkdownString(this.state.hoverText))
        }

        let text = await this.lsp.getHoverText(doc.uri.toString(), pos)

        if (text !== '') {
            text += await this.getSymbolLink(doc.uri.toString(), pos)
        }

        const mdString = new vscode.MarkdownString(text)

        mdString.supportHtml = true
        mdString.isTrusted = true

        return new vscode.Hover(mdString)
    }

    async getSymbolLink(uri: string, pos: vscode.Position): Promise<string> {
        const symbol = await this.lsp.getSymbol(uri, pos)
        if (symbol === undefined) {
            return ''
        }

        const json = JSON.stringify(symbol)

        return `<br>[Inspect](command:alive.inspect?${encodeURIComponent(json)})`
    }
}
