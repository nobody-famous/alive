import { activate } from '../extension'

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
        // openTextDocument: jest.fn(),
    },
    languages: {
        createDiagnosticCollection: jest.fn(),
    },
    // commands: {
    //     executeCommand: jest.fn(),
    // },
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

describe('Extension tests', () => {
    it('Activate', async () => {
        const ctx = {
            subscriptions: [],
            extensionPath: 'foo',
        }

        await activate(ctx)
    })
})
