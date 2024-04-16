import { Selection } from 'vscode'
import { EvalInfo, MacroInfo } from '../../Types'
import { LSP } from '../../backend/LSP'
import {
    clearRepl,
    compileFile,
    inlineEval,
    inspect,
    inspectMacro,
    loadAsdfSystem,
    loadFile,
    macroexpand,
    macroexpand1,
    openScratchPad,
    refreshAsdfSystems,
    refreshPackages,
    refreshThreads,
    selectSexpr,
    sendToRepl,
    tryCompileWithDiags,
} from '../Repl'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const utilsMock = jest.requireMock('../../Utils')
jest.mock('../../Utils')

describe('Repl tests', () => {
    it('clearRepl', () => {
        const ui = { clearRepl: jest.fn() }

        clearRepl(ui)
        expect(ui.clearRepl).toHaveBeenCalled()
    })

    type FakeEditor = {
        edit: () => void
        selection: Selection
        document: {
            getText: () => void
            uri: { toString: () => string }
            save: () => void
        }
    }
    const createFakeEditor = (): FakeEditor => ({
        edit: jest.fn(),
        selection: new vscodeMock.Selection(),
        document: {
            getText: jest.fn(),
            uri: { toString: jest.fn() },
            save: jest.fn(),
        },
    })

    describe('sendToRepl', () => {
        const runTest = async (evalInfo: unknown, validate: () => void) => {
            const lsp = { getEvalInfo: jest.fn().mockReturnValue(evalInfo), evalWithOutput: jest.fn() }
            let editorFn: ((editor: unknown) => Promise<void>) | undefined

            utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
                editorFn = fn
            })

            await sendToRepl(lsp)
            await editorFn?.(createFakeEditor())

            validate()
        }

        it('No info', async () => {
            await runTest(undefined, () => expect(vscodeMock.workspace.saveAll).not.toHaveBeenCalled())
        })

        it('Have info', async () => {
            await runTest({}, () => expect(vscodeMock.workspace.saveAll).toHaveBeenCalled())
        })
    })

    describe('inlineEval', () => {
        beforeEach(() => {
            vscodeMock.window.showTextDocument.mockReset()
            vscodeMock.commands.executeCommand.mockReset()
        })

        const runTest = async (
            evalInfo: EvalInfo | undefined,
            evalResult: string | undefined,
            validate: (lsp: Pick<LSP, 'getEvalInfo' | 'eval'>) => void
        ) => {
            const lsp = { getEvalInfo: jest.fn(async () => evalInfo), eval: jest.fn(async () => evalResult) }
            const state = { hoverText: '' }
            let editorFn: ((editor: unknown) => Promise<void>) | undefined

            utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
                editorFn = fn
            })

            await inlineEval(lsp, state)
            await editorFn?.(createFakeEditor())

            validate(lsp)
        }

        it('OK', async () => {
            await runTest({ text: 'some text', package: 'some package' }, 'some result', (lsp) => {
                expect(vscodeMock.window.showTextDocument).toHaveBeenCalled()
                expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('editor.action.showHover')
            })
        })

        it('No info', async () => {
            await runTest(undefined, undefined, (lsp: Pick<LSP, 'getEvalInfo'>) => {
                expect(lsp.getEvalInfo).toHaveBeenCalled()
                expect(vscodeMock.window.showTextDocument).not.toHaveBeenCalled()
            })
        })

        it('No eval result', async () => {
            await runTest({ text: 'some text', package: 'some package' }, undefined, (lsp) => {
                expect(lsp.eval).toHaveBeenCalled()
                expect(vscodeMock.window.showTextDocument).not.toHaveBeenCalled()
            })
        })
    })

    describe('Macro Expand', () => {
        type MacroLSP = Pick<LSP, 'macroexpand' | 'macroexpand1' | 'getMacroInfo'>

        beforeEach(() => {})

        const runTest = async (
            fn: (lsp: MacroLSP) => void,
            macroInfo: MacroInfo | undefined,
            macroResult: string | undefined,
            validate: (lsp: MacroLSP, editor: FakeEditor) => void
        ) => {
            const lsp: MacroLSP = {
                macroexpand: jest.fn(async () => macroResult),
                macroexpand1: jest.fn(),
                getMacroInfo: jest.fn(async () => macroInfo),
            }
            const editor = createFakeEditor()
            let editorFn: ((editor: unknown) => Promise<void>) | undefined

            utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
                editorFn = fn
            })

            fn(lsp)
            await editorFn?.(editor)

            validate(lsp, editor)
        }

        it('macroexpand with info', async () => {
            const info: MacroInfo = {
                range: new vscodeMock.Range(),
                text: 'some text',
                package: 'some package',
            }

            await runTest(macroexpand, info, undefined, (lsp) => {
                expect(lsp.macroexpand).toHaveBeenCalled()
                expect(lsp.getMacroInfo).toHaveBeenCalled()
            })
        })

        it('macroexpand with new text', async () => {
            const info: MacroInfo = {
                range: new vscodeMock.Range(),
                text: 'some text',
                package: 'some package',
            }

            await runTest(macroexpand, info, 'new text', (lsp, editor) => {
                expect(lsp.macroexpand).toHaveBeenCalled()
                expect(lsp.getMacroInfo).toHaveBeenCalled()
                expect(editor.edit).toHaveBeenCalled()
            })
        })

        it('editor.edit function', async () => {
            const info: MacroInfo = {
                range: new vscodeMock.Range(),
                text: 'some text',
                package: 'some package',
            }
            const lsp: MacroLSP = {
                macroexpand: jest.fn(),
                macroexpand1: jest.fn(async () => 'new text'),
                getMacroInfo: jest.fn(async () => info),
            }
            let builderFn: ((builder: { replace: () => void }) => void) | undefined
            const editor = {
                edit: jest.fn((fn) => {
                    builderFn = fn
                }),
                document: { uri: { toString: jest.fn() } },
            }
            let editorFn: ((editor: unknown) => Promise<void>) | undefined

            utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
                editorFn = fn
            })

            await macroexpand1(lsp)
            await editorFn?.(editor)

            const builder = { replace: jest.fn() }
            builderFn?.(builder)

            expect(builder.replace).toHaveBeenCalled()
        })

        it('macroexpand1', async () => {
            await runTest(macroexpand1, undefined, undefined, (lsp) => expect(lsp.getMacroInfo).toHaveBeenCalled())
        })
    })

    describe('openScratchPad', () => {
        beforeEach(() => {
            vscodeMock.workspace.openTextDocument.mockReset()
            vscodeMock.window.showErrorMessage.mockReset()
        })

        it('OK', async () => {
            vscodeMock.workspace.fs.readFile.mockReturnValueOnce('Some content')
            utilsMock.getFolderPath.mockReturnValueOnce('/some/folder')

            await openScratchPad({ workspacePath: '/some/path' })

            expect(vscodeMock.workspace.openTextDocument).toHaveBeenCalled()
        })

        it('Failed', async () => {
            utilsMock.getFolderPath.mockReturnValueOnce('/some/folder')
            utilsMock.createFolder.mockImplementationOnce(() => {
                throw new Error('Failed, as requested')
            })

            await openScratchPad({ workspacePath: '/some/path' })

            expect(vscodeMock.workspace.openTextDocument).not.toHaveBeenCalled()
            expect(vscodeMock.window.showErrorMessage).toHaveBeenCalled()
        })

        it('readFileContent fail', async () => {
            utilsMock.getFolderPath.mockReturnValueOnce('/some/folder')
            vscodeMock.workspace.fs.readFile.mockImplementationOnce(() => {
                throw new Error('Failed, as requested')
            })

            await openScratchPad({ workspacePath: '/some/path' })
        })
    })

    describe('tryCompileWithDiags', () => {
        beforeEach(() => {
            utilsMock.tryCompile.mockReset()
            utilsMock.updateDiagnostics.mockReset()
        })

        const runTest = async (respValue: unknown) => {
            const lsp = { tryCompileFile: jest.fn() }
            const state = {
                workspacePath: '/workspace/path',
                compileRunning: false,
                diagnostics: { set: jest.fn() },
            }
            let editorFn: ((editor: unknown) => Promise<void>) | undefined

            utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
                editorFn = fn
            })
            utilsMock.tryCompile.mockReturnValueOnce(respValue)

            tryCompileWithDiags(lsp, state)
            await editorFn?.(createFakeEditor())
        }

        it('Have response', async () => {
            await runTest({ foo: 'bar' })
            expect(utilsMock.updateDiagnostics).toHaveBeenCalled()
        })

        it('No response', async () => {
            await runTest(undefined)
            expect(utilsMock.updateDiagnostics).not.toHaveBeenCalled()
        })
    })

    it('compileFile', async () => {
        const lsp = { compileFile: jest.fn() }
        const state = { compileRunning: false }
        const editor = createFakeEditor()
        let editorFn: ((editor: unknown) => Promise<void>) | undefined

        utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
            editorFn = fn
        })

        compileFile(lsp, state)

        const task = editorFn?.(editor)
        expect(vscodeMock.workspace.saveAll).toHaveBeenCalled()

        vscodeMock.workspace.saveAll.mockReset()
        await editorFn?.(editor)

        expect(vscodeMock.workspace.saveAll).not.toHaveBeenCalled()

        await task
        expect(lsp.compileFile).toHaveBeenCalled()
    })

    it('loadFile', async () => {
        const lsp = { loadFile: jest.fn() }
        let editorFn: ((editor: unknown) => Promise<void>) | undefined

        utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
            editorFn = fn
        })

        loadFile(lsp)

        await editorFn?.(createFakeEditor())

        expect(lsp.loadFile).toHaveBeenCalled()
    })

    describe('inspectMacro', () => {
        const runTest = async (
            info: MacroInfo | undefined,
            validate: (lsp: Pick<LSP, 'getMacroInfo' | 'inspectMacro'>) => void
        ) => {
            const lsp = {
                getMacroInfo: jest.fn(async () => info),
                inspectMacro: jest.fn(),
            }
            let editorFn: ((editor: unknown) => Promise<void>) | undefined

            utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
                editorFn = fn
            })

            await inspectMacro(lsp)
            await editorFn?.(createFakeEditor())

            validate(lsp)
        }

        it('Have info', async () => {
            await runTest({ text: 'some text', package: 'some package', range: new vscodeMock.Range() }, (lsp) =>
                expect(lsp.inspectMacro).toHaveBeenCalled()
            )
        })

        it('No info', async () => {
            await runTest(undefined, (lsp) => expect(lsp.inspectMacro).not.toHaveBeenCalled())
        })
    })

    it('inspect', async () => {
        const lsp = { inspectSymbol: jest.fn() }

        await inspect(lsp, { name: 'foo', package: 'bar' })

        expect(lsp.inspectSymbol).toHaveBeenCalled()
    })

    describe('loadAsdfSystem', () => {
        it('Select system', async () => {
            const lsp = { listAsdfSystems: jest.fn(), loadAsdfSystem: jest.fn() }

            vscodeMock.window.showQuickPick.mockReturnValueOnce('some name')
            await loadAsdfSystem(lsp)

            expect(lsp.loadAsdfSystem).toHaveBeenCalled()
        })

        it('Select system with names', async () => {
            const lsp = { listAsdfSystems: jest.fn(async () => []), loadAsdfSystem: jest.fn() }

            vscodeMock.window.showQuickPick.mockReturnValueOnce('some name')
            await loadAsdfSystem(lsp)

            expect(lsp.loadAsdfSystem).toHaveBeenCalled()
        })

        it('Nothing picked', async () => {
            const lsp = { listAsdfSystems: jest.fn(), loadAsdfSystem: jest.fn() }

            await loadAsdfSystem(lsp)

            expect(lsp.loadAsdfSystem).not.toHaveBeenCalled()
        })
    })

    it('refreshThreads', async () => {
        const lsp = { listThreads: jest.fn() }
        const ui = { updateThreads: jest.fn() }

        await refreshThreads(ui, lsp)

        expect(ui.updateThreads).toHaveBeenCalled()
    })

    it('refreshAsdfSystems', async () => {
        const lsp = { listAsdfSystems: jest.fn() }
        const ui = { updateAsdfSystems: jest.fn() }

        await refreshAsdfSystems(ui, lsp)

        expect(ui.updateAsdfSystems).toHaveBeenCalled()
    })

    it('refreshPackages', async () => {
        const lsp = { listPackages: jest.fn() }
        const ui = { updatePackages: jest.fn() }

        await refreshPackages(ui, lsp)

        expect(ui.updatePackages).toHaveBeenCalled()
    })

    describe('selectSexpr', () => {
        it('Have range', async () => {
            const lsp = {
                getTopExprRange: jest.fn(async () => new vscodeMock.Range()),
            }
            const editor = createFakeEditor()
            let editorFn: ((editor: unknown) => Promise<void>) | undefined

            utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
                editorFn = fn
            })

            await selectSexpr(lsp)
            await editorFn?.(editor)

            expect(editor.selection).toMatchObject({})
        })

        it('No range', async () => {
            const lsp = { getTopExprRange: jest.fn() }
            const editor = createFakeEditor()
            let editorFn: ((editor: unknown) => Promise<void>) | undefined

            utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
                editorFn = fn
            })

            await selectSexpr(lsp)
            await editorFn?.(editor)

            expect(editor.selection).toMatchObject({})
        })
    })
})
