import { activate } from '../extension'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

// const packagesMock = jest.requireMock('../vscode/views/PackagesTree')
jest.mock('../vscode/views/PackagesTree')

// const threadsMock = jest.requireMock('../vscode/views/ThreadsTree')
jest.mock('../vscode/views/ThreadsTree')

// const historyMock = jest.requireMock('../vscode/views/ReplHistory')
jest.mock('../vscode/views/ReplHistory')

// const asdfMock = jest.requireMock('../vscode/views/AsdfSystemsTree')
jest.mock('../vscode/views/AsdfSystemsTree')

const utilsMock = jest.requireMock('../vscode/Utils')
jest.mock('../vscode/Utils')

const uiMock = jest.requireMock('../vscode/UI')
jest.mock('../vscode/UI')

// const lspMock = jest.requireMock('../vscode/backend/LSP')
jest.mock('../vscode/backend/LSP')

const configMock = jest.requireMock('../config')
jest.mock('../config')

describe('Extension tests', () => {
    const ctx = {
        subscriptions: [],
        extensionPath: '/ext/path',
    }

    const resetCtx = () => {
        ctx.subscriptions = []
        ctx.extensionPath = '/ext/path'
    }

    beforeEach(() => {
        jest.restoreAllMocks()

        resetCtx()

        utilsMock.getWorkspaceOrFilePath.mockImplementation(() => '/fake/path')

        configMock.readAliveConfig.mockImplementation(() => ({
            lsp: {},
        }))
    })

    it('Activate', async () => {
        await activate(ctx)

        expect(configMock.readAliveConfig).toHaveBeenCalled()
        expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('replHistory.focus')
        expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('lispRepl.focus')
    })

    describe('UI events', () => {
        it('diagnosticsRefresh', async () => {
            uiMock.on.mockImplementation((name: string, fn: () => void) => console.log('UI ON', name, fn))
            await activate(ctx)
        })
    })
})
