import * as os from 'os'
import * as path from 'path'

import {
    convertSeverity,
    createFile,
    createTempFile,
    dirExists,
    findSubFolders,
    getFolderPath,
    getWorkspaceOrFilePath,
    parseToInt,
    updateCompilerDiagnostics,
    updateDiagnostics,
} from '../Utils'
import { Position } from 'vscode'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode', () => ({
    window: { createOutputChannel: () => ({ appendLine: () => {} }) },
    languages: {
        createDiagnosticCollection: jest.fn().mockImplementationOnce(() => 5),
    },
    workspace: { workspaceFolders: [], fs: { createDirectory: jest.fn(), writeFile: jest.fn() } },
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3,
    },
    Uri: { file: jest.fn() },
    Position: class {
        constructor() {}
    },
    Range: class {
        constructor() {}
    },
    Diagnostic: class {
        constructor() {}
    },
}))

const fsMock = jest.requireMock('fs')
jest.mock('fs', () => ({ promises: { access: jest.fn() } }))
jest.mock('os', () => ({
    homedir: () => '/test/home/dir',
}))

describe('Utils Tests', () => {
    beforeEach(() => {
        jest.resetAllMocks()
    })

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

    it('convertSeverity', () => {
        expect(convertSeverity('error')).toBe(vscodeMock.DiagnosticSeverity.Error)
        expect(convertSeverity('read_error')).toBe(vscodeMock.DiagnosticSeverity.Error)
        expect(convertSeverity('note')).toBe(vscodeMock.DiagnosticSeverity.Warning)
        expect(convertSeverity('redefinition')).toBe(vscodeMock.DiagnosticSeverity.Warning)
        expect(convertSeverity('style_warning')).toBe(vscodeMock.DiagnosticSeverity.Warning)
        expect(convertSeverity('info')).toBe(vscodeMock.DiagnosticSeverity.Information)
        expect(convertSeverity('foo')).toBe(vscodeMock.DiagnosticSeverity.Error)
    })

    describe('updateCompilerDiagnostics', () => {
        it('No notes', () => {
            const setFn = jest.fn()

            updateCompilerDiagnostics({ set: setFn }, [])
            expect(setFn).not.toHaveBeenCalled()
        })

        it('One note', () => {
            const setFn = jest.fn()

            vscodeMock.Uri.file.mockImplementationOnce((name: string) => name)

            updateCompilerDiagnostics({ set: setFn }, [
                {
                    message: 'Hello',
                    severity: 'info',
                    location: { file: 'a', start: new Position(1, 2), end: new Position(3, 4) },
                },
            ])

            expect(vscodeMock.Uri.file).toHaveBeenCalledWith('a')
            expect(setFn).toHaveBeenCalledWith('a', expect.anything())
        })
    })

    it('updateDiagnostics', () => {
        const setFn = jest.fn()

        vscodeMock.Uri.file.mockImplementationOnce((name: string) => name)
        updateDiagnostics({ set: setFn }, 'a', [
            {
                message: 'Hello',
                severity: 'info',
                location: { file: 'a', start: new Position(1, 2), end: new Position(3, 4) },
            },
        ])

        expect(vscodeMock.Uri.file).toHaveBeenCalledWith('a')
        expect(setFn).toHaveBeenCalledWith('a', [])
        expect(setFn).toHaveBeenCalledWith('a', expect.anything())
    })

    it('getFolderPath', () => {
        expect(getFolderPath({ workspacePath: 'foo' }, 'bar')).toBe(path.join('foo', 'bar'))
    })

    it('createFile', async () => {
        vscodeMock.Uri.file.mockImplementation((name: string) => name)

        expect(await createFile({ workspacePath: 'foo' }, 'bar', 'baz', 'stuff')).toBe(path.join('foo', 'bar', 'baz'))
        expect(vscodeMock.workspace.fs.createDirectory).toHaveBeenCalled()
        expect(vscodeMock.workspace.fs.writeFile).toHaveBeenCalledWith(path.join('foo', 'bar', 'baz'), expect.anything())
    })

    it('createTempFile', async () => {
        const tmpFile = path.join('foo', '.vscode', 'alive', 'fasl', 'tmp.lisp')

        vscodeMock.Uri.file.mockImplementation((name: string) => name)

        expect(await createTempFile({ workspacePath: 'foo' }, { getText: () => '' })).toBe(tmpFile)
        expect(vscodeMock.workspace.fs.createDirectory).toHaveBeenCalled()
        expect(vscodeMock.workspace.fs.writeFile).toHaveBeenCalledWith(tmpFile, expect.anything())
    })
})
