import { EvalInfo } from '../../Types'
import { LSP } from '../../backend/LSP'
import { clearRepl, inlineEval, sendToRepl } from '../Repl'

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

    const createFakeEditor = () => ({
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
})
