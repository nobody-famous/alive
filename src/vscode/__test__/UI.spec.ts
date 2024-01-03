import { UI, UIState } from '../UI'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: () => ({ appendLine: () => {} }),
        registerWebviewViewProvider: jest.fn(),
        registerTreeDataProvider: jest.fn(),
    },
    TreeItem: class {},
}))

const replObj = {
    on: jest.fn(),
    clear: jest.fn(),
    clearInput: jest.fn(),
}
jest.mock('../views/LispRepl', () => ({
    LispRepl: jest.fn().mockImplementation(() => replObj),
}))

jest.mock('../views/ReplHistory')

const createState = (): UIState => {
    const state: UIState = {
        ctx: { subscriptions: [], extensionPath: 'foo' },
        historyNdx: -1,
    }

    return state
}

describe('UI tests', () => {
    beforeEach(() => jest.clearAllMocks())

    it('clearRepl', () => {
        const state = createState()
        const ui = new UI(state)

        ui.clearRepl()
    })

    describe('replView', () => {
        const getReplFn = (ui: UI, name: string): ((...args: unknown[]) => void) | undefined => {
            let evalFn = undefined
            const onFn = (label: string, fn: (...args: unknown[]) => void) => {
                if (name === label) {
                    evalFn = fn
                }
            }

            for (let mockCount = 0; mockCount < 4; mockCount++) {
                replObj.on.mockImplementationOnce(onFn)
            }

            ui.initRepl()

            return evalFn
        }

        describe('eval', () => {
            it('No history', () => {
                const ui = new UI(createState())
                const evalFn = getReplFn(ui, 'eval')

                let evalPkg: string | undefined
                let evalText: string | undefined

                ui.on('eval', (pkg: string, text: string) => {
                    evalPkg = pkg
                    evalText = text
                })

                expect(evalFn).not.toBeUndefined()
                evalFn?.('foo', 'bar')

                expect(evalPkg).toBe('bar')
                expect(evalText).toBe('foo')
            })
        })

        describe('historyDown', () => {
            it('No tree', () => {
                const state = createState()
                const ui = new UI(state)
                const fn = getReplFn(ui, 'historyDown')

                fn?.()
                expect(state.historyNdx).toBe(-1)
            })

            it('With tree', () => {
                const state = createState()
                const ui = new UI(state)
                const fn = getReplFn(ui, 'historyDown')

                ui.initHistoryTree([])
                fn?.()

                expect(state.historyNdx).toBe(-1)
                expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalled()
            })
        })
    })
})
