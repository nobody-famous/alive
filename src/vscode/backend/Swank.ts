import { EOL } from 'os'
import * as vscode from 'vscode'
import { readLexTokens } from '../../lisp'
import * as cmds from '../commands'
import { Repl } from '../repl'
import { Backend, HostPort, SwankBackendState } from '../Types'
import { COMMON_LISP_ID, findEditorForDoc, hasValidLangId, REPL_ID, startCompileTimer } from '../Utils'

const swankOutputChannel = vscode.window.createOutputChannel('Swank Trace')

export class Swank implements Backend {
    state: SwankBackendState

    constructor(state: SwankBackendState) {
        this.state = state
    }

    isConnected(): boolean {
        return this.state.repl !== undefined
    }

    async connect(hostPort: HostPort) {
        if (this.state.repl === undefined) {
            this.state.repl = new Repl(this.state.ctx)
            this.state.repl.on('close', () => {
                this.state.repl = undefined
            })
            this.state.repl.on('swank-trace', (msg) => {
                swankOutputChannel.append(`${msg}${EOL}`)
            })
        }

        await this.state.repl.connect(hostPort.host, hostPort.port)
    }

    async disconnect() {
        await this.state.repl?.disconnect()
        this.state.repl = undefined
    }

    getPkgName(doc: vscode.TextDocument, line: number): string {
        const pkg = this.state.pkgMgr.getPackageForLine(doc.fileName, line)
        const pkgName = doc.languageId === REPL_ID ? this.state.repl?.curPackage : pkg?.name

        return pkgName ?? ':cl-user'
    }

    async sendToRepl(editor: vscode.TextEditor, text: string, pkgName: string, captureOutput: boolean) {
        await this.state.repl?.send(editor, text, pkgName, captureOutput)

        if (editor.document.languageId === REPL_ID) {
            this.state.repl?.addHistory(text, pkgName)
        }
    }

    async textDocumentSaved(doc: vscode.TextDocument) {
        if (doc.languageId !== COMMON_LISP_ID || this.state.repl === undefined) {
            return
        }

        const cfg = vscode.workspace.getConfiguration('alive')

        if (cfg.autoLoadOnSave) {
            await this.state.repl.loadFile(doc.fileName, false)
        }
    }

    textDocumentChanged(event: vscode.TextDocumentChangeEvent) {
        if (!hasValidLangId(event.document, [COMMON_LISP_ID, REPL_ID])) {
            return
        }

        startCompileTimer(this.state.extState)

        cmds.clearInlineResults(this.state.extState)
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
