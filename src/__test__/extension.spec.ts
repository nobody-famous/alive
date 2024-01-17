import { activate } from '../extension'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: () => ({ appendLine: () => {} }),
        registerWebviewViewProvider: jest.fn(),
        // registerTreeDataProvider: jest.fn(),
        // createQuickPick: jest.fn(),
        showErrorMessage: jest.fn(),
        // showQuickPick: jest.fn(),
        // showTextDocument: jest.fn().mockImplementation(() => ({
        //     selection: {},
        //     revealRange: jest.fn(),
        // })),
    },
    workspace: {
        workspaceFolders: [],
        getConfiguration: jest.fn(),
        // openTextDocument: jest.fn(),
    },
    languages: {
        createDiagnosticCollection: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
    // ViewColumn: { Two: 2 },
    // TreeItem: class {},
    // Position: class {},
    // Range: class {},
    // Selection: class {},
}))

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
// jest.mock('../vscode/Utils', () => ({
//     getWorkspaceOrFilePath: jest.fn().mockImplementation(() => '/fake/path'),
// }))

const uiObj = {
    on: jest.fn(),
    init: jest.fn(),
    registerProviders: jest.fn(),
    initInspector: jest.fn(),
}
// const uiMod = jest.requireMock('../vscode/UI')
jest.mock('../vscode/UI', () => ({
    UI: jest.fn().mockImplementation(() => uiObj),
}))

const lspObj = {
    on: jest.fn(),
}
jest.mock('../vscode/backend/LSP', () => ({
    LSP: jest.fn().mockImplementation(() => lspObj),
}))

const configMock = jest.requireMock('../config')
jest.mock('../config')

describe('Extension tests', () => {
    beforeEach(() => {
        jest.resetAllMocks()

        vscodeMock.window.showErrorMessage.mockImplementation((msg: unknown) => console.log('SHOW ERROR MESSAGE', msg))
        utilsMock.getWorkspaceOrFilePath.mockImplementation(() => '/fake/path')
        configMock.readAliveConfig.mockImplementation(() => ({
            lsp: {},
        }))
    })

    it('Activate', async () => {
        const ctx = {
            subscriptions: [],
            extensionPath: 'foo',
        }

        await activate(ctx)

        expect(configMock.readAliveConfig).toHaveBeenCalled()
        // expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('replHistory.focus')
        // expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('listRepl.focus')
    })
})
