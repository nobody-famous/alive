import { EOL } from 'os'
import * as vscode from 'vscode'
import { Expr, getLexTokens, Parser, readLexTokens } from '../../lisp'
import * as cmds from '../commands'
import { Repl } from '../repl'
import { CompileFileResp, HostPort, InstalledSlimeInfo, LocalBackend, SwankBackendState } from '../Types'
import {
    COMMON_LISP_ID,
    findEditorForDoc,
    getDocumentExprs,
    hasValidLangId,
    REPL_ID,
    startCompileTimer,
    useEditor,
} from '../Utils'
import { CompletionProvider } from './CompletionProvider'
import { DefinitionProvider } from './DefProvider'
import { FormatProvider } from './Format'
import { SemTokensProvider } from './SemTokens'
import { installAndConfigureSlime } from './SlimeInstall'

const swankOutputChannel = vscode.window.createOutputChannel('Swank Trace')

export class Swank implements LocalBackend {
    state: SwankBackendState
    defaultPort: number = 4005
    installedSlimeInfo: InstalledSlimeInfo | undefined

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
        await this.updatePackageNames()
    }

    async disconnect() {
        await this.state.repl?.disconnect()
        this.state.repl = undefined
    }

    async loadFile(path: string) {
        await this.state.repl?.loadFile(path)
        await this.updatePackageNames()
    }

    async compileFile(path: string, ignoreOutput: boolean): Promise<CompileFileResp | undefined> {
        let setConnFlags = false

        try {
            this.state.repl?.conn?.setIgnoreOutput(ignoreOutput)
            this.state.repl?.conn?.setIgnoreDebug(ignoreOutput)

            setConnFlags = true

            return await this.state.repl?.compileFile(path)
        } finally {
            if (setConnFlags) {
                this.state.repl?.conn?.setIgnoreOutput(false)
                this.state.repl?.conn?.setIgnoreDebug(false)
            }
        }
    }

    getPkgName(doc: vscode.TextDocument, line: number): string {
        const pkg = this.state.pkgMgr.getPackageForLine(doc.fileName, line)
        const pkgName = doc.languageId === REPL_ID ? this.state.repl?.curPackage : pkg?.name

        return pkgName ?? ':cl-user'
    }

    async addToReplView(text: string) {
        await this.state.repl?.addToView(text)
    }

    async inlineEval(text: string, pkgName: string): Promise<string | undefined> {
        return await this.state.repl?.inlineEval(text, pkgName)
    }

    replDebugAbort() {
        this.state.repl?.abort()
    }

    async macroExpand(text: string, pkgName: string): Promise<string | undefined> {
        return this.state.repl?.macroExpand(text, pkgName)
    }

    async macroExpandAll(text: string, pkgName: string): Promise<string | undefined> {
        return this.state.repl?.macroExpandAll(text, pkgName)
    }

    async disassemble(text: string, pkgName: string): Promise<string | undefined> {
        return this.state.repl?.disassemble(text, pkgName)
    }

    async listAsdfSystems(): Promise<string[]> {
        return this.state.repl?.listAsdfSystems() ?? []
    }

    async compileAsdfSystem(name: string): Promise<CompileFileResp | undefined> {
        return this.state.repl?.compileAsdfSystem(name)
    }

    async loadAsdfSystem(name: string): Promise<CompileFileResp | undefined> {
        return this.state.repl?.loadAsdfSystem(name)
    }

    async getSymbolDoc(text: string, pkgName: string): Promise<string | undefined> {
        this.state.repl?.setIgnoreDebug(true)
        const resp = this.state.repl?.getDoc(text, pkgName)
        this.state.repl?.setIgnoreDebug(false)

        return resp
    }

    getFormatProvider(): vscode.DocumentFormattingEditProvider {
        return new FormatProvider(this.state.extState)
    }

    getSemTokensProvider(): vscode.DocumentSemanticTokensProvider {
        return new SemTokensProvider(this.state)
    }

    getCompletionProvider(): vscode.CompletionItemProvider {
        return new CompletionProvider(this.state)
    }

    getDefinitionProvider(): vscode.DefinitionProvider {
        return new DefinitionProvider(this.state)
    }

    async getOpArgs(name: string, pkgName: string): Promise<string | undefined> {
        return this.state.repl?.getOpArgs(name, pkgName)
    }

    async inspector(text: string, pkgName: string) {
        await this.state.repl?.inspector(text, pkgName)
    }

    async inspectorPrev() {
        await this.state.repl?.inspectorPrev()
    }

    async inspectorNext() {
        await this.state.repl?.inspectorNext()
    }

    async inspectorRefresh() {
        await this.state.repl?.inspectorRefresh()
    }

    async inspectorQuit() {
        await this.state.repl?.inspectorQuit()
    }

    async sendToRepl(editor: vscode.TextEditor, text: string, pkgName: string, captureOutput: boolean) {
        await this.state.repl?.send(editor, text, pkgName, captureOutput)

        await this.updatePackageNames()
    }

    async replNthRestart(restart: number) {
        await this.state.repl?.nthRestart(restart)
        await this.updatePackageNames()
    }

    async updatePackageNames() {
        if (!this.isConnected()) {
            return
        }

        const pkgs = (await this.state.repl?.getPackageNames()) ?? []

        for (const pkg of pkgs) {
            this.state.pkgMgr.addPackage(pkg)
        }

        useEditor([COMMON_LISP_ID], (editor: vscode.TextEditor) => {
            const exprs = getDocumentExprs(editor.document)
            this.updatePkgMgr(editor.document, exprs)
        })
    }

    async updatePkgMgr(doc: vscode.TextDocument | undefined, exprs: Expr[]) {
        if (doc?.languageId !== COMMON_LISP_ID) {
            return
        }

        await this.state.pkgMgr.update(this.state.repl, doc, exprs)
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

    async editorChanged(editor?: vscode.TextEditor) {
        if (editor === undefined || !hasValidLangId(editor.document, [COMMON_LISP_ID, REPL_ID])) {
            return
        }

        let tokens = getLexTokens(editor.document.fileName)
        if (tokens === undefined) {
            tokens = readLexTokens(editor.document.fileName, editor.document.getText())
        }

        const parser = new Parser(getLexTokens(editor.document.fileName) ?? [])
        const exprs = parser.parse()

        startCompileTimer(this.state.extState)

        await this.updatePkgMgr(editor.document, exprs)
    }

    async installServer() {
        this.installedSlimeInfo = await installAndConfigureSlime(this.state)
    }

    serverInstallPath(): string | undefined {
        return this.installedSlimeInfo?.path
    }

    serverStartupCommand(): string[] | undefined {
        const cmd = vscode.workspace.getConfiguration('alive').swank.startupCommand

        return Array.isArray(cmd) ? cmd : undefined
    }
}