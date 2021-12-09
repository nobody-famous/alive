import * as vscode from 'vscode'
import * as cmds from '../commands'

import { Backend, SwankBackendState } from '../Types'
import { COMMON_LISP_ID, findEditorForDoc, hasValidLangId, REPL_ID } from '../Utils'

export class Swank implements Backend {
    state: SwankBackendState

    constructor(state: SwankBackendState) {
        this.state = state
    }

    isConnected(): boolean {
        return this.state.repl !== undefined
    }

    async saveTextDocument(doc: vscode.TextDocument) {
        if (doc.languageId !== COMMON_LISP_ID || this.state.repl === undefined) {
            return
        }

        const cfg = vscode.workspace.getConfiguration('alive')

        if (cfg.autoLoadOnSave) {
            await this.state.repl.loadFile(doc.fileName, false)
        }
    }

    changeTextDocument(event: vscode.TextDocumentChangeEvent) {
        if (!hasValidLangId(event.document, [COMMON_LISP_ID, REPL_ID])) {
            return
        }

        startCompileTimer()

        cmds.clearInlineResults(this.state)
        readLexTokens(event.document.fileName, event.document.getText())

        const editor = findEditorForDoc(event.document)

        if (editor?.document.languageId !== REPL_ID) {
            return
        }

        for (const change of event.contentChanges) {
            if (change.range === undefined) {
                continue
            }

            if (editor.document.languageId === REPL_ID) {
                this.state.repl?.documentChanged()
            }
        }
    }
}
