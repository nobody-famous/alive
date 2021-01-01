import { format } from 'util'
import * as vscode from 'vscode'
import { exprToString, findAtom, getLexTokens, getLocalDef, Lexer, Parser, readLexTokens } from './lisp'
import { Colorizer, tokenModifiersLegend, tokenTypesLegend } from './vscode/colorize'
import * as cmds from './vscode/commands'
import { CompletionProvider } from './vscode/CompletionProvider'
import { DefinitionProvider } from './vscode/DefinitionProvider'
import * as fmt from './vscode/format/Formatter'
import { PackageMgr } from './vscode/PackageMgr'
import { getHelp } from './vscode/SigHelp'
import { ExtensionState } from './vscode/Types'
import {
    COMMON_LISP_ID,
    getDocumentExprs,
    getPkgName,
    getTopExpr,
    hasValidLangId,
    REPL_ID,
    toVscodePos,
    updatePkgMgr,
    useEditor,
} from './vscode/Utils'

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
        await getCompletionProvider()
    )
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: COMMON_LISP_ID }, await getCompletionProvider())
    vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: REPL_ID }, await getCompletionProvider())

    vscode.languages.registerSignatureHelpProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getSigHelpProvider(), ' ')
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: COMMON_LISP_ID }, getSigHelpProvider(), ' ')
    vscode.languages.registerSignatureHelpProvider({ scheme: 'file', language: REPL_ID }, getSigHelpProvider(), ' ')

    vscode.languages.registerRenameProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getRenameProvider())
    vscode.languages.registerRenameProvider({ scheme: 'file', language: COMMON_LISP_ID }, getRenameProvider())

    vscode.languages.registerHoverProvider({ scheme: 'file', language: COMMON_LISP_ID }, getHoverProvider())

    vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'untitled', language: COMMON_LISP_ID },
        getDocumentFormatter()
    )
    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: COMMON_LISP_ID }, getDocumentFormatter())

    vscode.languages.registerDefinitionProvider({ scheme: 'untitled', language: COMMON_LISP_ID }, getDefinitionProvider())
    vscode.languages.registerDefinitionProvider({ scheme: 'file', language: COMMON_LISP_ID }, getDefinitionProvider())
    vscode.languages.registerDefinitionProvider({ scheme: 'file', language: REPL_ID }, getDefinitionProvider())

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

function getSigHelpProvider(): vscode.SignatureHelpProvider {
    return {
        async provideSignatureHelp(
            document: vscode.TextDocument,
            pos: vscode.Position,
            token: vscode.CancellationToken,
            ctx: vscode.SignatureHelpContext
        ): Promise<vscode.SignatureHelp> {
            const pkg = state.pkgMgr.getPackageForLine(document.fileName, pos.line)

            if (pkg === undefined) {
                return new vscode.SignatureHelp()
            }

            return await getHelp(state.repl, document, pos, pkg.name)
        },
    }
}

async function getCompletionProvider(): Promise<vscode.CompletionItemProvider> {
    return {
        async provideCompletionItems(
            document: vscode.TextDocument,
            pos: vscode.Position,
            token: vscode.CancellationToken,
            ctx: vscode.CompletionContext
        ) {
            try {
                if (state.repl === undefined) {
                    return
                }

                const exprs = getDocumentExprs(document)

                await updatePkgMgr(state, document, exprs)

                const atom = findAtom(exprs, pos)
                const textStr = atom !== undefined ? exprToString(atom) : undefined
                let pkgName = getPkgName(document, pos.line, state.pkgMgr, state.repl)

                if (textStr !== undefined && !textStr.startsWith('#+') && !textStr.startsWith('#-')) {
                    const ndx = textStr.indexOf(':')

                    if (ndx > 0) {
                        pkgName = textStr.substr(0, ndx)
                    }
                }

                if (pkgName === undefined) {
                    return []
                }

                const provider = new CompletionProvider(state.pkgMgr)
                return await provider.getCompletions(state.repl, exprs, pos, pkgName)
            } catch (err) {
                vscode.window.showErrorMessage(format(err))
                return []
            }
        },
    }
}

function getDocumentFormatter(): vscode.DocumentFormattingEditProvider {
    return {
        provideDocumentFormattingEdits(doc: vscode.TextDocument, opts: vscode.FormattingOptions) {
            const lex = new Lexer(doc.getText())
            const tokens = lex.getTokens()
            const formatter = new fmt.Formatter(readFormatterOptions(), tokens)
            const edits = formatter.format()

            return edits.length > 0 ? edits : undefined
        },
    }
}

function getDefinitionProvider(): vscode.DefinitionProvider {
    return {
        async provideDefinition(doc: vscode.TextDocument, pos: vscode.Position, token: vscode.CancellationToken) {
            try {
                const provider = new DefinitionProvider()
                const exprs = getDocumentExprs(doc)
                const topExpr = await getTopExpr(doc, pos)

                await updatePkgMgr(state, doc, exprs)

                const pkg = state.pkgMgr.getPackageForLine(doc.fileName, pos.line)
                const atom = findAtom(exprs, pos)
                const label = atom !== undefined ? exprToString(atom) : undefined
                let local: vscode.Location | undefined = undefined

                if (!label?.startsWith('#') && topExpr !== undefined) {
                    const locDef = label !== undefined ? getLocalDef(topExpr, pos, label) : undefined

                    if (locDef !== undefined) {
                        const start = toVscodePos(locDef.start)
                        const range = new vscode.Range(start, start)

                        if (start.line !== atom?.start.line || start.character !== atom.start.character) {
                            local = new vscode.Location(doc.uri, range)
                        }
                    }
                }

                if (state.repl === undefined || pkg === undefined) {
                    return []
                }

                const defs = await provider.getDefinitions(state.repl, pkg.name, exprs, pos)

                if (local !== undefined) {
                    defs?.push(local)
                }

                return defs ?? []
            } catch (err) {
                vscode.window.showErrorMessage(format(err))
                return []
            }
        },
    }
}

function readFormatterOptions(): fmt.Options {
    const cfg = vscode.workspace.getConfiguration('alive')
    const defaults: fmt.Options = {
        indentWidth: 2,
        closeParenOwnLine: 'never',
        closeParenStacked: 'always',
        indentCloseParenStack: true,
    }

    if (cfg?.format === undefined) {
        return defaults
    }

    const indentWidth = cfg.format.indentWidth ?? defaults.indentWidth

    const indentCloseParenStack = cfg.format.indentCloseParenStack ?? defaults.indentCloseParenStack
    const closeParenStacked = cfg.format.closeParenStacked ?? defaults.closeParenStacked
    const closeParenOwnLine = cfg.format.closeParenOwnLine ?? defaults.closeParenOwnLine

    return {
        indentWidth,
        indentCloseParenStack,
        closeParenStacked,
        closeParenOwnLine,
    }
}
