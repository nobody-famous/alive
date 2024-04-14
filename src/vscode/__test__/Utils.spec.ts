import * as os from 'os'
import * as path from 'path'

import { Position } from 'vscode'
import {
    convertSeverity,
    diagnosticsEnabled,
    dirExists,
    findSubFolders,
    getFolderPath,
    getLspBasePath,
    getWorkspaceOrFilePath,
    parseLocation,
    parseNote,
    parsePos,
    parseToInt,
    startCompileTimer,
    strToHtml,
    strToMarkdown,
    tryCompile,
    updateDiagnostics,
    useEditor,
} from '../Utils'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const fsMock = jest.requireMock('fs')
jest.mock('fs', () => ({ promises: { access: jest.fn() } }))
jest.mock('os', () => ({
    homedir: () => '/test/home/dir',
}))

const cmdsMock = jest.requireMock('../commands')
jest.mock('../commands')

jest.mock('../Log')

jest.useFakeTimers()

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

    it('parsePos', () => {
        expect(parsePos(5)).toBeUndefined()
        expect(parsePos({ line: 1, character: 'foo' })).toBeUndefined()
        expect(parsePos({ line: 1, character: 10 })).not.toBeUndefined()
    })

    it('parseLocation', () => {
        expect(parseLocation('/some/path', 5)).toBeUndefined()
        expect(parseLocation('/some/path', { start: 5, end: 'foo' })).toBeUndefined()
        expect(
            parseLocation('/some/path', { start: { line: 1, character: 10 }, end: { line: 1, character: 10 } })
        ).not.toBeUndefined()
    })

    it('parseNote', () => {
        expect(parseNote('/some/path', 5)).toBeUndefined()
        expect(parseNote('/some/path', { message: 'foo', severity: 'bar' })).toBeUndefined()
        expect(
            parseNote('/some/path', {
                location: { start: { line: 1, character: 10 }, end: { line: 1, character: 10 } },
            })
        ).toMatchObject({
            message: '',
            severity: '',
            location: { file: '/some/path', start: new vscodeMock.Position(), end: new vscodeMock.Position() },
        })
    })

    describe('getWorkspaceOrFilePath', () => {
        it('No folders', async () => {
            vscodeMock.workspace.workspaceFolders = []
            expect(await getWorkspaceOrFilePath()).toBe('/test/home/dir')
        })

        it('Has editor', async () => {
            vscodeMock.window.activeTextEditor = { document: { fileName: path.join('foo', 'bar') } }
            vscodeMock.workspace.workspaceFolders = []
            expect(await getWorkspaceOrFilePath()).toBe('foo')
        })

        it('Has folders', async () => {
            vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: 'foo' } }]
            expect(await getWorkspaceOrFilePath()).toBe('foo')

            vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: 'foo' } }, { uri: { fsPath: 'bar' } }]
            expect(await getWorkspaceOrFilePath()).toBe('foo')
        })

        describe('pickWorkspaceFolder', () => {
            it('No vscode folder', async () => {
                const accessFunc = () => {
                    throw new Error('Failed, as requested')
                }

                for (let count = 0; count < 2; count++) {
                    fsMock.promises.access.mockImplementationOnce(accessFunc)
                }

                vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: 'foo' } }, { uri: { fsPath: 'bar' } }]

                expect(await getWorkspaceOrFilePath()).toBe('foo')
            })

            it('No alive folder', async () => {
                const accessFunc = (file: string) => {
                    if (file !== path.join('foo', '.vscode')) {
                        throw new Error('Failed, as requested')
                    }
                }

                for (let count = 0; count < 4; count++) {
                    fsMock.promises.access.mockImplementationOnce(accessFunc)
                }

                vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: 'foo' } }, { uri: { fsPath: 'bar' } }]

                expect(await getWorkspaceOrFilePath()).toBe('foo')
            })
        })
    })

    it('dirExists', async () => {
        const accessFunc = (path: string) => {
            if (path !== '.') {
                throw new Error('Failed, as requested')
            }
        }
        fsMock.promises.access.mockImplementationOnce(accessFunc)
        fsMock.promises.access.mockImplementationOnce(accessFunc)

        expect(await dirExists('.')).toBe(true)
        expect(await dirExists(os.homedir())).toBe(false)
    })

    describe('findSubFolders', () => {
        it('One level', async () => {
            const accessFunc = (file: string) => {
                if (file !== path.join('foo', '.vscode')) {
                    throw new Error('Failed, as requested')
                }
            }
            fsMock.promises.access.mockImplementationOnce(accessFunc)
            fsMock.promises.access.mockImplementationOnce(accessFunc)
            fsMock.promises.access.mockImplementationOnce(accessFunc)

            expect(await findSubFolders([{ uri: { fsPath: 'foo' } }, { uri: { fsPath: 'bar' } }], ['.vscode'])).toMatchObject([
                { uri: { fsPath: 'foo' } },
            ])
            expect(await findSubFolders([{ uri: { fsPath: os.homedir() } }], ['.vscode'])).toMatchObject([])
        })

        it('Two levels', async () => {
            const accessFunc = (file: string) => {
                if (file !== path.join('foo', '.vscode', 'alive')) {
                    throw new Error('Failed, as requested')
                }
            }
            fsMock.promises.access.mockImplementationOnce(accessFunc)
            fsMock.promises.access.mockImplementationOnce(accessFunc)
            fsMock.promises.access.mockImplementationOnce(accessFunc)
            fsMock.promises.access.mockImplementationOnce(accessFunc)
            fsMock.promises.access.mockImplementationOnce(accessFunc)

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

            vscodeMock.Uri.file.mockReturnValueOnce('foo')
            updateDiagnostics({ set: setFn }, 'foo', [])

            expect(setFn).toHaveBeenCalledWith(expect.anything(), [])
        })

        it('One note', () => {
            const setFn = jest.fn()

            for (let count = 0; count < 2; count++) {
                vscodeMock.Uri.file.mockImplementationOnce((name: string) => name)
            }

            updateDiagnostics({ set: setFn }, 'foo', [
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

    describe('tryCompile', () => {
        const lsp = { tryCompileFile: jest.fn() }
        const doc = { getText: () => '', fileName: 'bar' }

        it('compileRunning', async () => {
            const resp = await tryCompile({ compileRunning: true, workspacePath: 'foo' }, lsp, doc)

            expect(resp).toBeUndefined()
        })

        it('compileRunning task', async () => {
            const state = { compileRunning: false, workspacePath: 'foo' }
            const task = tryCompile(state, lsp, doc)

            expect(state.compileRunning).toBe(true)

            lsp.tryCompileFile.mockReturnValueOnce({ notes: [] })
            expect(await tryCompile(state, lsp, doc)).toBeUndefined()
            expect(await task).not.toBeUndefined()

            expect(state.compileRunning).toBe(false)
        })

        it('notes', async () => {
            const state = { compileRunning: false, workspacePath: 'foo' }
            const notes = [
                { message: 'test', severity: 'info', location: { file: 'bar' } },
                {
                    message: 'test',
                    severity: 'info',
                    location: { file: path.join('foo', '.vscode', 'alive', 'fasl', 'tmp.lisp') },
                },
            ]

            lsp.tryCompileFile.mockReturnValueOnce({ notes })
            await tryCompile(state, lsp, doc)

            expect(notes[0].location.file).toBe('bar')
            expect(notes[1].location.file).toBe('bar')
        })

        it('No response', async () => {
            lsp.tryCompileFile.mockReturnValueOnce(undefined)
            expect(await tryCompile({ compileRunning: false, workspacePath: 'foo' }, lsp, doc)).toBeUndefined()
        })
    })

    it('startCompileTimer', async () => {
        const timeout = {
            hasRef: jest.fn(),
            refresh: jest.fn(),
            [Symbol.toPrimitive]: () => 5,
            ref: () => timeout,
            unref: () => timeout,
        }

        const spy = jest.spyOn(global, 'setTimeout')

        startCompileTimer(
            { updatePackages: jest.fn() },
            { tryCompileFile: jest.fn(), listPackages: jest.fn() },
            { compileTimeoutID: timeout, workspacePath: 'foo', compileRunning: false, diagnostics: { set: jest.fn() } }
        )

        jest.runAllTimers()

        const fn = spy.mock.calls[0][0]
        await fn()

        expect(cmdsMock.tryCompileWithDiags).toHaveBeenCalled()
        expect(cmdsMock.refreshPackages).toHaveBeenCalled()
    })

    it('diagnosticsEnabled', () => {
        expect(diagnosticsEnabled()).toBe(true)

        vscodeMock.workspace.getConfiguration.mockImplementationOnce(() => ({}))
        expect(diagnosticsEnabled()).toBe(true)

        vscodeMock.workspace.getConfiguration.mockImplementationOnce(() => ({ enableDiagnostics: true }))
        expect(diagnosticsEnabled()).toBe(true)

        vscodeMock.workspace.getConfiguration.mockImplementationOnce(() => ({ enableDiagnostics: false }))
        expect(diagnosticsEnabled()).toBe(false)
    })

    describe('useEditor', () => {
        it('No editor', () => {
            const fn = jest.fn()

            useEditor(['foo'], fn)
            expect(fn).not.toHaveBeenCalled()

            vscodeMock.window.activeTextEditor = { document: { languageId: 'bar' } }
            useEditor(['foo'], fn)
            expect(fn).not.toHaveBeenCalled()
        })

        it('Have editor', () => {
            const fn = jest.fn()

            vscodeMock.window.activeTextEditor = { document: { languageId: 'foo' } }
            useEditor(['foo'], fn)
            expect(fn).toHaveBeenCalled()
        })

        it('Error', () => {
            useEditor(['foo'], () => {
                throw new Error('Failed, as requested')
            })

            expect(vscodeMock.window.showErrorMessage).toHaveBeenCalled()
        })
    })

    it('strToHtml', () => {
        expect(strToHtml('&')).toBe('&amp;')
        expect(strToHtml('<foo>\n')).toBe('&lt;foo&gt;<br>')
    })

    it('strToMarkdown', () => {
        expect(strToMarkdown(' ')).toBe('&nbsp;')
        expect(strToMarkdown('<foo>\n')).toBe('<foo>  \n')
    })

    it('getLspBasePath', () => {
        expect(getLspBasePath({ extensionPath: 'path' })).toBe(path.join('path', 'out', 'alive-lsp'))
    })
})
