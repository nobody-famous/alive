import { UI, UIState } from '../UI'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: () => ({ appendLine: () => {} }),
        registerWebviewViewProvider: jest.fn(),
    },
    TreeItem: class {},
}))

const replModk = jest.requireMock('../views/LispRepl')
jest.mock('../views/LispRepl', () => ({
    LispRepl: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        clear: jest.fn(),
    })),
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

    it('Constructor', () => {
        const state = createState()
        new UI(state)

        expect(replModk.LispRepl).toHaveBeenCalled()
        expect(vscodeMock.window.registerWebviewViewProvider).toHaveBeenCalled()
    })

    it('clearRepl', () => {
        const state = createState()
        const ui = new UI(state)

        ui.clearRepl()
    })
})
