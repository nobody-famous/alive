import { format } from 'util'
import * as vscode from 'vscode'
import { getLexTokens } from '../../lisp'
import { Colorizer } from '../colorize'
import { SwankBackendState } from '../Types'
import { getDocumentExprs } from '../Utils'

export class SemTokensProvider implements vscode.DocumentSemanticTokensProvider {
    state: SwankBackendState

    constructor(state: SwankBackendState) {
        this.state = state
    }

    async provideDocumentSemanticTokens(doc: vscode.TextDocument): Promise<vscode.SemanticTokens> {
        const tokens = getLexTokens(doc.fileName)
        const emptyTokens = new vscode.SemanticTokens(new Uint32Array(0))
        const colorizer = new Colorizer(this.state.repl)

        if (tokens === undefined || tokens.length === 0) {
            return emptyTokens
        }

        try {
            const exprs = getDocumentExprs(doc)

            await this.state.pkgMgr.update(this.state.repl, doc, exprs)

            return await colorizer.run(tokens)
        } catch (err) {
            vscode.window.showErrorMessage(format(err))
        }

        return emptyTokens
    }
}
