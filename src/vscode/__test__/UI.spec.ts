import { UI, UIState } from '../UI'

jest.mock('vscode', () => ({
    window: {
        createOutputChannel: () => ({ appendLine: () => {} }),
        registerWebviewViewProvider: jest.fn(),
    },
    TreeItem: class {},
}))

const replObj = {
    on: jest.fn(),
    clear: jest.fn(),
}
jest.mock('../views/LispRepl', () => ({
    LispRepl: jest.fn().mockImplementation(() => replObj),
}))

const createState = (): UIState => {
    const state: UIState = {
        ctx: { subscriptions: [], extensionPath: 'foo' },
        historyNdx: 0,
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

            replObj.on.mockImplementationOnce((label: string, fn: (...args: unknown[]) => void) => {
                if (name === label) {
                    evalFn = fn
                }
            })

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
    })
})
