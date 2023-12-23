import { strictEqual } from 'assert'
import { getWorkspaceOrFilePath, parseToInt } from '../Utils'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode', () => ({
    window: { createOutputChannel: () => ({ appendLine: () => {} }) },
    languages: {
        createDiagnosticCollection: jest.fn(),
    },
    workspace: { workspaceFolders: [] },
}))

jest.mock('os', () => ({
    homedir: () => 'test_home_dir',
}))

describe('Utils Tests', () => {
    it('parseToInt', () => {
        strictEqual(parseToInt(5), 5)
        strictEqual(parseToInt('5'), 5)
        strictEqual(parseToInt('5.9'), undefined)
        strictEqual(parseToInt(5.9), undefined)
        strictEqual(parseToInt('foo'), undefined)
    })

    describe('getWorkspaceOrFilePath', () => {
        it('No folders', async () => {
            vscodeMock.workspace.workspaceFolders = []
            strictEqual(await getWorkspaceOrFilePath(), 'test_home_dir')
        })

        it('Has folders', async () => {
            vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: 'foo' } }]
            strictEqual(await getWorkspaceOrFilePath(), 'foo')
        })
    })
})
