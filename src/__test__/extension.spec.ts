import { Buffer } from 'buffer'
import { getAllCallbacks } from '../../TestHelpers'
import { activate } from '../extension'
import { COMMON_LISP_ID } from '../vscode/Utils'
import { HistoryItem } from '../vscode/Types'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const fsMock = jest.requireMock('fs')
jest.mock('fs')

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

const lspMock = jest.requireMock('../vscode/backend/LSP')
jest.mock('../vscode/backend/LSP')

const lspProcMock = jest.requireMock('../vscode/backend/LspProcess')
jest.mock('../vscode/backend/LspProcess')

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
            lsp: {
                remote: {
                    host: 'foo',
                    port: 1234,
                },
            },
        }))
    })

    it('Activate', async () => {
        await activate(ctx)

        expect(configMock.readAliveConfig).toHaveBeenCalled()
        expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('replHistory.focus')
        expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('lispRepl.focus')
    })

    describe('readReplHistory', () => {
        const historyTest = async (json: string, expectedHistory: HistoryItem[]) => {
            uiMock.initHistoryTree.mockReset()

            fsMock.promises = {
                readFile: jest.fn().mockImplementation(async () => Buffer.from(json)),
            }

            await activate(ctx)

            expect(uiMock.initHistoryTree).toHaveBeenCalledWith(expectedHistory)
        }

        it('Empty array', async () => {
            await historyTest('[]', [])
        })

        it('One item', async () => {
            await historyTest('[{"pkgName":"foo","text":"bar"}]', [{ pkgName: 'foo', text: 'bar' }])
        })

        it('Invalid item', async () => {
            await historyTest('[5,{"pkgName":"foo","text":"bar"},"baz"]', [{ pkgName: 'foo', text: 'bar' }])
        })

        it('Not array', async () => {
            await historyTest('{"foo":"bar"}', [])
        })

        it('Invalid json', async () => {
            await historyTest('foo', [])
        })
    })

    it('Tree fails', async () => {
        uiMock.initPackagesTree.mockReset()
        uiMock.initAsdfSystemsTree.mockReset()
        uiMock.initThreadsTree.mockReset()

        lspMock.listPackages.mockImplementation(() => {
            throw new Error('Failed, as requested')
        })
        lspMock.listAsdfSystems.mockImplementation(() => {
            throw new Error('Failed, as requested')
        })
        lspMock.listThreads.mockImplementation(() => {
            throw new Error('Failed, as requested')
        })

        await activate(ctx)

        expect(uiMock.initPackagesTree).not.toHaveBeenCalled()
        expect(uiMock.initAsdfSystemsTree).not.toHaveBeenCalled()
        expect(uiMock.initThreadsTree).not.toHaveBeenCalled()
    })

    describe('UI events', () => {
        const refreshTest = async (validate: () => void) => {
            const fns = await getAllCallbacks(uiMock.on, 10, async () => await activate(ctx))
            const editors = [
                { document: { languageId: 'foo' } },
                { document: { languageId: COMMON_LISP_ID } },
                { document: { languageId: COMMON_LISP_ID } },
            ]

            await fns.diagnosticsRefresh(editors)

            validate()
        }

        it('diagnosticsRefresh', async () => {
            await refreshTest(() => {
                expect(utilsMock.tryCompile).toHaveBeenCalledTimes(2)
                expect(utilsMock.updateDiagnostics).not.toHaveBeenCalled()
            })
        })

        it('diagnosticsRefresh with compile resp', async () => {
            utilsMock.tryCompile.mockReset()
            utilsMock.tryCompile.mockImplementation(() => ({ notes: [] }))

            await refreshTest(() => {
                expect(utilsMock.tryCompile).toHaveBeenCalledTimes(2)
                expect(utilsMock.updateDiagnostics).toHaveBeenCalledTimes(2)
            })
        })

        it('saveReplHistory', async () => {
            const fns = await getAllCallbacks(uiMock.on, 10, async () => await activate(ctx))

            fsMock.promises = { writeFile: jest.fn() }
            await fns.saveReplHistory()

            expect(fsMock.promises.writeFile).toHaveBeenCalled()
        })
    })

    describe('setWorkspaceEventHandlers', () => {
        const getHandler = async (toMock: jest.Mock): Promise<((...args: unknown[]) => void) | undefined> => {
            let handler: (() => void) | undefined = undefined

            toMock.mockImplementation((fn) => (handler = fn))

            await activate(ctx)

            return handler
        }

        it('onDidChangeTextDocument', async () => {
            const fn = await getHandler(vscodeMock.workspace.onDidChangeTextDocument)

            fn?.()

            expect(lspMock.textDocumentChanged).toHaveBeenCalled()
        })

        it('onDidChangeActiveTextEditor', async () => {
            const fn = await getHandler(vscodeMock.window.onDidChangeActiveTextEditor)

            fn?.()

            expect(lspMock.editorChanged).toHaveBeenCalled()
        })

        describe('onDidOpenTextDocument', () => {
            beforeEach(() => {
                utilsMock.diagnosticsEnabled.mockReset()
                utilsMock.startCompileTimer.mockReset()
            })

            it('Valid ID, have diagnostics', async () => {
                const fn = await getHandler(vscodeMock.workspace.onDidOpenTextDocument)

                utilsMock.hasValidLangId.mockImplementationOnce(() => true)
                utilsMock.diagnosticsEnabled.mockImplementationOnce(() => true)
                fn?.()

                expect(utilsMock.startCompileTimer).toHaveBeenCalled()
            })

            it('Valid ID, without diagnostics', async () => {
                const fn = await getHandler(vscodeMock.workspace.onDidOpenTextDocument)

                utilsMock.hasValidLangId.mockImplementationOnce(() => true)
                utilsMock.diagnosticsEnabled.mockImplementationOnce(() => false)
                fn?.()

                expect(utilsMock.startCompileTimer).not.toHaveBeenCalled()
            })

            it('Invalid ID', async () => {
                const fn = await getHandler(vscodeMock.workspace.onDidOpenTextDocument)

                utilsMock.hasValidLangId.mockImplementationOnce(() => false)
                fn?.()

                expect(utilsMock.diagnosticsEnabled).not.toHaveBeenCalled()
            })
        })
    })

    describe('startLocalServer', () => {
        beforeEach(() => {
            configMock.readAliveConfig.mockImplementation(() => ({
                lsp: {},
            }))

            lspMock.connect.mockReset()
            lspProcMock.downloadLspServer.mockReset()
            lspProcMock.startLspServer.mockReset()
        })

        it('Start OK', async () => {
            lspProcMock.downloadLspServer.mockImplementationOnce(() => 'foo')
            lspProcMock.startLspServer.mockImplementationOnce(() => 1234)

            await activate(ctx)

            expect(lspProcMock.downloadLspServer).toHaveBeenCalled()
            expect(lspProcMock.startLspServer).toHaveBeenCalled()
            expect(lspMock.connect).toHaveBeenCalled()
        })

        it('Start Invalid Port', async () => {
            lspProcMock.downloadLspServer.mockImplementationOnce(() => 'foo')
            lspProcMock.startLspServer.mockImplementationOnce(() => NaN)

            await activate(ctx)

            expect(lspProcMock.downloadLspServer).toHaveBeenCalled()
            expect(lspProcMock.startLspServer).toHaveBeenCalled()
            expect(lspMock.connect).not.toHaveBeenCalled()
        })

        it('Start Invalid Path', async () => {
            lspProcMock.downloadLspServer.mockImplementationOnce(() => 5)

            await activate(ctx)

            expect(lspProcMock.downloadLspServer).toHaveBeenCalled()
            expect(lspProcMock.startLspServer).not.toHaveBeenCalled()
            expect(lspMock.connect).not.toHaveBeenCalled()
        })
    })
})
