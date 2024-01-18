import { activate } from '../extension'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const packagesObj = {
    update: jest.fn(),
}
jest.mock('../vscode/views/PackagesTree', () => ({
    PackagesTreeProvider: jest.fn().mockImplementation(() => packagesObj),
}))

const threadsObj = {
    update: jest.fn(),
}
jest.mock('../vscode/views/ThreadsTree', () => ({
    ThreadsTreeProvider: jest.fn().mockImplementation(() => threadsObj),
}))

const historyObj = {}
jest.mock('../vscode/views/ReplHistory', () => ({
    HistoryNode: jest.fn(),
    ReplHistoryTreeProvider: jest.fn().mockImplementation(() => historyObj),
}))

const asdfObj = {
    update: jest.fn(),
}
jest.mock('../vscode/views/AsdfSystemsTree', () => ({
    AsdfSystemsTreeProvider: jest.fn().mockImplementation(() => asdfObj),
}))

jest.mock('../vscode/backend/LSP', () => ({
    LSP: jest.fn(),
}))

const utilsMock = jest.requireMock('../vscode/Utils')
jest.mock('../vscode/Utils')

// const uiMock = jest.requireMock('../vscode/UI')
jest.mock('../vscode/UI')

const lspMock = jest.requireMock('../vscode/backend/LSP')
jest.mock('../vscode/backend/LSP')

const configMock = jest.requireMock('../config')
jest.mock('../config')

describe('Extension tests', () => {
    beforeEach(() => {
        jest.resetAllMocks()

        utilsMock.getWorkspaceOrFilePath.mockImplementation(() => '/fake/path')

        configMock.readAliveConfig.mockImplementation(() => ({
            lsp: {},
        }))

        lspMock.LSP.mockImplementation(() => ({
            on: jest.fn(),
            connect: jest.fn(),
        }))
    })

    it('Activate', async () => {
        const ctx = {
            subscriptions: [],
            extensionPath: 'foo',
        }

        await activate(ctx)

        expect(configMock.readAliveConfig).toHaveBeenCalled()
        expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('replHistory.focus')
        expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('lispRepl.focus')
    })
})
