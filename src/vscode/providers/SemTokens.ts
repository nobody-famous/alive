import { format } from 'util'
import * as vscode from 'vscode'
import { getLexTokens } from '../../lisp'
import { Colorizer } from '../colorize'
import { ExtensionState } from '../Types'
import { getDocumentExprs, updatePkgMgr } from '../Utils'

export function getSemTokensProvider(state: ExtensionState): vscode.DocumentSemanticTokensProvider {
    return new Provider(state)
}

class Provider implements vscode.DocumentSemanticTokensProvider {
    state: ExtensionState

    constructor(state: ExtensionState) {
        this.state = state
    }

    async provideDocumentSemanticTokens(doc: vscode.TextDocument): Promise<vscode.SemanticTokens> {
        const colorizer = new Colorizer(this.state.repl)
        const tokens = getLexTokens(doc.fileName)
        const emptyTokens = new vscode.SemanticTokens(new Uint32Array(0))

        if (tokens === undefined || tokens.length === 0) {
            return emptyTokens
        }

        try {
            const exprs = getDocumentExprs(doc)

            await updatePkgMgr(this.state, doc, exprs)

            return await colorizer.run(tokens)
        } catch (err) {
            vscode.window.showErrorMessage(format(err))
        }

        return emptyTokens
    }
}
