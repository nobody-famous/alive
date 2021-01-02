import { format } from 'util'
import * as vscode from 'vscode'
import { exprToString, findAtom, getLexTokens, Parser, readLexTokens } from './lisp'
import { Colorizer, tokenModifiersLegend, tokenTypesLegend } from './vscode/colorize'
import * as cmds from './vscode/commands'
import { PackageMgr } from './vscode/PackageMgr'
import { getDefinitionProvider, getSigHelpProvider } from './vscode/providers'
import { getCompletionProvider } from './vscode/providers/CompletionProvider'
import { getDocumentFormatter } from './vscode/providers/FormatProvider'
import { ExtensionState } from './vscode/Types'
import { COMMON_LISP_ID, getDocumentExprs, getPkgName, hasValidLangId, REPL_ID, updatePkgMgr, useEditor } from './vscode/Utils'

const legend = new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend)
const state: ExtensionState = {
    repl: undefined,
    pkgMgr: new PackageMgr(),
    hoverText: '',
}

export const activate = async (ctx: vscode.ExtensionContext) => {
    vscode.window.onDidChangeVisibleTextEditors((editors: vscode.TextEditor[]) => visibleEditorsChanged(editors))
    vscode.window.onDidChangeActiveTextEditor((editor?: vscode.TextEditor) => editorChanged(editor), null, ctx.subscriptions)
    vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => openTextDocument(doc))
    vscode.workspace.onDidChangeTextDocument(
        (event: vscode.TextDocumentChangeEvent) => changeTextDocument(event),
        null,
        ctx.subscriptions
    )

    vscode.languages.registerCompletionItemProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        await getCompletionProvider(state)
    )
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: COMMON_LISP_ID }, getCompletionProvider(state))
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: REPL_ID }, getCompletionProvider(state))

    vscode.languages.registerSignatureHelpProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        getSigHelpProvider(state),
        ' '
    )
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: COMMON_LISP_ID }, getSigHelpProvider(state), ' ')
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: REPL_ID }, getSigHelpProvider(state), ' ')

    vscode.languages.registerRenameProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getRenameProvider())
    vscode.languages.registerRenameProvider({ scheme: 'file', language: COMMON_LISP_ID }, getRenameProvider())

    vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider())

    vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        getDocumentFormatter()
    )
    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: COMMON_LISP_ID }, getDocumentFormatter())

    vscode.languages.registerDefinitionProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getDefinitionProvider(state))
    vscode.languages.registerDefinitionProvider({ scheme: 'file', language: COMMON_LISP_ID }, getDefinitionProvider(state))
    vscode.languages.registerDefinitionProvider({ scheme: 'file', language: REPL_ID }, getDefinitionProvider(state))

    vscode.languages.registerDocumentSemanticTokensProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        semTokensProvider(),
        legend
    )
    vscode.languages.registerDocumentSemanticTokensProvider(
        { scheme: 'file', language: COMMON_LISP_ID },
        semTokensProvider(),
        legend
    )
    vscode.languages.registerDocumentSemanticTokensProvider({ scheme: 'file', language: REPL_ID }, semTokensProvider(), legend)

    ctx.subscriptions.push(vscode.commands.registerCommand('alive.selectSexpr', () => cmds.selectSexpr()))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.sendToRepl', () => cmds.sendToRepl(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inlineEval', () => cmds.inlineEval(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.clearInlineResults', () => cmds.clearInlineResults(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.attachRepl', () => cmds.attachRepl(state, ctx)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.detachRepl', () => cmds.detachRepl(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.replHistory', () => cmds.replHistory(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.debugAbort', () => cmds.debugAbort(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.nthRestart', (n: unknown) => cmds.nthRestart(state, n)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpand', () => cmds.macroExpand(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.macroExpandAll', () => cmds.macroExpandAll(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.disassemble', () => cmds.disassemble(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.loadFile', () => cmds.loadFile(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector', () => cmds.inspector(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector-prev', () => cmds.inspectorPrev(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector-next', () => cmds.inspectorNext(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector-refresh', () => cmds.inspectorRefresh(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.inspector-quit', () => cmds.inspectorQuit(state)))
    ctx.subscriptions.push(vscode.commands.registerCommand('alive.systemSkeleton', () => cmds.systemSkeleton()))

    useEditor([COMMON_LISP_ID, REPL_ID], (editor: vscode.TextEditor) => {
        readLexTokens(editor.document.fileName, editor.document.getText())
        visibleEditorsChanged(vscode.window.visibleTextEditors)
    })
}

function getRenameProvider(): vscode.RenameProvider {
    return {
        async provideRenameEdits(
            doc: vscode.TextDocument,
            pos: vscode.Position,
            newName: string,
            token: vscode.CancellationToken
        ): Promise<vscode.WorkspaceEdit> {
            console.log('Rename', newName)
            return new vscode.WorkspaceEdit()
        },
    }
}

function visibleEditorsChanged(editors: vscode.TextEditor[]) {
    for (const editor of editors) {
        if (hasValidLangId(editor.document, [COMMON_LISP_ID, REPL_ID])) {
            readLexTokens(editor.document.fileName, editor.document.getText())
        }
    }
}

function getHoverProvider(): vscode.HoverProvider {
    return {
        async provideHover(
            doc: vscode.TextDocument,
            pos: vscode.Position,
            token: vscode.CancellationToken
        ): Promise<vscode.Hover> {
            if (state.hoverText !== '') {
                return new vscode.Hover(state.hoverText)
            }

            let text = ''

            if (state.repl === undefined) {
                return new vscode.Hover('')
            }

            const exprs = getDocumentExprs(doc)
            const atom = findAtom(exprs, pos)
            const textStr = atom !== undefined ? exprToString(atom) : undefined
            let pkgName = getPkgName(doc, pos.line, state.pkgMgr, state.repl)

            if (textStr === undefined) {
                return new vscode.Hover('')
            }

            text = await state.repl.getDoc(textStr, pkgName)

            if (text.startsWith('No such symbol')) {
                text = ''
            }

            return new vscode.Hover(text)
        },
    }
}

function semTokensProvider(): vscode.DocumentSemanticTokensProvider {
    return {
        async provideDocumentSemanticTokens(
            doc: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.SemanticTokens> {
            const colorizer = new Colorizer(state.repl)
            const tokens = getLexTokens(doc.fileName)
            const emptyTokens = new vscode.SemanticTokens(new Uint32Array(0))

            if (tokens === undefined || tokens.length === 0) {
                return emptyTokens
            }

            try {
                const exprs = getDocumentExprs(doc)

                await updatePkgMgr(state, doc, exprs)

                return await colorizer.run(tokens)
            } catch (err) {
                vscode.window.showErrorMessage(format(err))
            }

            return emptyTokens
        },
    }
}

async function editorChanged(editor?: vscode.TextEditor) {
    if (editor === undefined || !hasValidLangId(editor.document, [COMMON_LISP_ID, REPL_ID])) {
        return
    }

    let tokens = getLexTokens(editor.document.fileName)
    if (tokens === undefined) {
        tokens = readLexTokens(editor.document.fileName, editor.document.getText())
    }

    const parser = new Parser(getLexTokens(editor.document.fileName) ?? [])
    const exprs = parser.parse()

    await updatePkgMgr(state, editor.document, exprs)
}

function openTextDocument(doc: vscode.TextDocument) {
    if (!hasValidLangId(doc, [COMMON_LISP_ID, REPL_ID])) {
        return
    }

    readLexTokens(doc.fileName, doc.getText())
}

function changeTextDocument(event: vscode.TextDocumentChangeEvent) {
    if (!hasValidLangId(event.document, [COMMON_LISP_ID, REPL_ID])) {
        return
    }

    cmds.clearInlineResults(state)
    readLexTokens(event.document.fileName, event.document.getText())

    const editor = findEditorForDoc(event.document)

    if (editor === undefined) {
        return
    }

    if (editor.document.languageId !== REPL_ID) {
        return
    }

    for (const change of event.contentChanges) {
        if (change.range !== undefined) {
            state.repl?.documentChanged()
        }
    }
}

function findEditorForDoc(doc: vscode.TextDocument): vscode.TextEditor | undefined {
    for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === doc) {
            return editor
        }
    }

    return undefined
}
