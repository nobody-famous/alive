import * as os from 'os'
import * as path from 'path'

import { dirExists, findSubFolders, getWorkspaceOrFilePath, parseToInt } from '../Utils'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode', () => ({
    window: { createOutputChannel: () => ({ appendLine: () => {} }) },
    languages: {
        createDiagnosticCollection: jest.fn(),
    },
    workspace: { workspaceFolders: [] },
}))

const fsMock = jest.requireMock('fs')
jest.mock('fs', () => ({ promises: { access: jest.fn() } }))
jest.mock('os', () => ({
    homedir: () => '/test/home/dir',
}))

describe('Utils Tests', () => {
    it('parseToInt', () => {
        expect(parseToInt(5)).toBe(5)
        expect(parseToInt('5')).toBe(5)
        expect(parseToInt('5.9')).toBe(undefined)
        expect(parseToInt(5.9)).toBe(undefined)
        expect(parseToInt('foo')).toBe(undefined)
    })

    describe('getWorkspaceOrFilePath', () => {
        it('No folders', async () => {
            vscodeMock.workspace.workspaceFolders = []
            expect(await getWorkspaceOrFilePath()).toBe('/test/home/dir')
        })

        it('Has folders', async () => {
            vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: 'foo' } }]
            expect(await getWorkspaceOrFilePath()).toBe('foo')
        })
    })

    it('dirExists', async () => {
        fsMock.promises.access.mockImplementation((path: string) => {
            if (path !== '.') {
                throw new Error('Failed, as requested')
            }
        })

        expect(await dirExists('.')).toBe(true)
        expect(await dirExists(os.homedir())).toBe(false)
    })

    describe('findSubFolders', () => {
        it('One level', async () => {
            fsMock.promises.access.mockImplementation((file: string) => {
                if (file !== path.join('foo', '.vscode')) {
                    throw new Error('Failed, as requested')
                }
            })

            expect(await findSubFolders([{ uri: { fsPath: 'foo' } }, { uri: { fsPath: 'bar' } }], ['.vscode'])).toMatchObject([
                { uri: { fsPath: 'foo' } },
            ])
            expect(await findSubFolders([{ uri: { fsPath: os.homedir() } }], ['.vscode'])).toMatchObject([])
        })

        it('Two levels', async () => {
            fsMock.promises.access.mockImplementation((file: string) => {
                if (file !== path.join('foo', '.vscode', 'alive')) {
                    throw new Error('Failed, as requested')
                }
            })

            expect(
                await findSubFolders([{ uri: { fsPath: 'foo' } }, { uri: { fsPath: 'bar' } }], ['.vscode', 'alive'])
            ).toMatchObject([{ uri: { fsPath: 'foo' } }])
            expect(await findSubFolders([{ uri: { fsPath: 'foo' } }, { uri: { fsPath: 'bar' } }], ['.vscode'])).toMatchObject([])
            expect(await findSubFolders([{ uri: { fsPath: os.homedir() } }], ['.vscode', 'alive'])).toMatchObject([])
        })
    })

    describe('pickWorkspaceFolder', () => {
        it('checking', () => {})
    })
})
