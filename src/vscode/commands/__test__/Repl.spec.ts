import { EvalInfo, MacroInfo } from '../../Types'
import { LSP } from '../../backend/LSP'
import { clearRepl, inlineEval, macroexpand, macroexpand1, openScratchPad, sendToRepl, tryCompileWithDiags } from '../Repl'

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
        document: {
            getText: () => void
            uri: { toString: () => string }
            selection: {}
        }
    }
    const createFakeEditor = (): FakeEditor => ({
        edit: jest.fn(),
        document: {
            getText: jest.fn(),
            uri: { toString: jest.fn() },
            selection: {},
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
            fn: (lsp: MacroLSP) => Promise<void>,
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

            await fn(lsp)
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

            await tryCompileWithDiags(lsp, state)
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
})
