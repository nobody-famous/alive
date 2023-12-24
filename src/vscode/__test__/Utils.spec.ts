import * as os from 'os'
import * as fs from 'fs'

import { strictEqual } from 'assert'
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
        strictEqual(parseToInt(5), 5)
        strictEqual(parseToInt('5'), 5)
        strictEqual(parseToInt('5.9'), undefined)
        strictEqual(parseToInt(5.9), undefined)
        strictEqual(parseToInt('foo'), undefined)
    })

    describe('getWorkspaceOrFilePath', () => {
        it('No folders', async () => {
            vscodeMock.workspace.workspaceFolders = []
            strictEqual(await getWorkspaceOrFilePath(), '/test/home/dir')
        })

        it('Has folders', async () => {
            vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: 'foo' } }]
            strictEqual(await getWorkspaceOrFilePath(), 'foo')
        })
    })

    it('dirExists', async () => {
        fsMock.promises.access.mockImplementation((path: string) => {
            if (path !== '.') {
                throw new Error('Failed, as requested')
            }
        })

        strictEqual(await dirExists('.'), true)
        strictEqual(await dirExists(os.homedir()), false)
    })

    describe('findSubFolders', () => {
        it('One level', async () => {
            fsMock.promises.access.mockImplementation((path: string) => {
                if (path !== 'foo/.vscode') {
                    throw new Error('Failed, as requested')
                }
            })

            expect(await findSubFolders([{ uri: { fsPath: 'foo' } }, { uri: { fsPath: 'bar' } }], ['.vscode'])).toMatchObject([
                { uri: { fsPath: 'foo' } },
            ])
            expect(await findSubFolders([{ uri: { fsPath: os.homedir() } }], ['.vscode'])).toMatchObject([])
        })

        it('Two levels', async () => {
            fsMock.promises.access.mockImplementation((path: string) => {
                if (path !== 'foo/.vscode/alive') {
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
