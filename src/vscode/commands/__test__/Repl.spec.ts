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

    describe('sendToRepl', () => {
        const fakeEditor = {
            document: {
                getText: jest.fn(),
                uri: { toString: jest.fn() },
                selection: {},
            },
        }

        const runTest = async (evalInfo: unknown, validate: () => void) => {
            const lsp = { getEvalInfo: jest.fn().mockReturnValue(evalInfo), evalWithOutput: jest.fn() }
            let editorFn: ((editor: unknown) => Promise<void>) | undefined

            utilsMock.useEditor.mockImplementationOnce((langs: string[], fn: (editor: unknown) => Promise<void>) => {
                editorFn = fn
            })

            await sendToRepl(lsp)
            await editorFn?.(fakeEditor)

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
        it('', async () => {
            const lsp = { getEvalInfo: jest.fn(), eval: jest.fn() }
            const state = { hoverText: '' }

            await inlineEval(lsp, state)
        })
    })
})
