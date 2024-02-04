import { Buffer } from 'buffer'
import { getAllCallbacks } from '../../TestHelpers'
import { activate } from '../extension'
import { COMMON_LISP_ID } from '../vscode/Utils'
import { HistoryItem } from '../vscode/Types'

const fsMock = jest.requireMock('fs')
jest.mock('fs')

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const cmdsMock = jest.requireMock('../vscode/commands')
jest.mock('../vscode/commands')

const packagesMock = jest.requireMock('../vscode/views/PackagesTree')
jest.mock('../vscode/views/PackagesTree')

const threadsMock = jest.requireMock('../vscode/views/ThreadsTree')
jest.mock('../vscode/views/ThreadsTree')

const historyMock = jest.requireMock('../vscode/views/ReplHistory')
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

    describe('Activate', () => {
        it('No document', async () => {
            await activate(ctx)

            expect(configMock.readAliveConfig).toHaveBeenCalled()
            expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('replHistory.focus')
            expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('lispRepl.focus')
        })

        it('Have document, not lisp', async () => {
            vscodeMock.window.activeTextEditor = { document: 'foo' }

            await activate(ctx)

            expect(vscodeMock.window.showTextDocument).toHaveBeenCalled()
        })

        it('Have document, is lisp', async () => {
            utilsMock.hasValidLangId.mockReturnValueOnce(true)

            await activate(ctx)

            expect(lspMock.editorChanged).toHaveBeenCalled()
            expect(vscodeMock.window.showTextDocument).toHaveBeenCalled()
        })
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

        lspMock.listPackages.mockImplementationOnce(() => {
            throw new Error('Failed, as requested')
        })
        lspMock.listAsdfSystems.mockImplementationOnce(() => {
            throw new Error('Failed, as requested')
        })
        lspMock.listThreads.mockImplementationOnce(() => {
            throw new Error('Failed, as requested')
        })

        await activate(ctx)

        expect(uiMock.initPackagesTree).not.toHaveBeenCalled()
        expect(uiMock.initAsdfSystemsTree).not.toHaveBeenCalled()
        expect(uiMock.initThreadsTree).not.toHaveBeenCalled()
    })

    const checkCallback = (fns: { [index: string]: () => void }, name: string, mockFn: jest.Mock) => {
        fns[name]()
        expect(mockFn).toHaveBeenCalled()
    }

    describe('UI events', () => {
        it('Simple redirects', async () => {
            const fns = await getAllCallbacks(uiMock.on, 10, async () => await activate(ctx))

            checkCallback(fns, 'eval', lspMock.evalFn)
            checkCallback(fns, 'inspect', lspMock.inspect)
            checkCallback(fns, 'inspectClosed', lspMock.inspectClosed)
            checkCallback(fns, 'inspectEval', lspMock.inspectEval)
            checkCallback(fns, 'inspectRefresh', lspMock.inspectRefresh)
            checkCallback(fns, 'inspectRefreshMacro', lspMock.inspectRefreshMacro)
            checkCallback(fns, 'inspectMacroInc', lspMock.inspectMacroInc)
        })

        it('listPackages', async () => {
            const fns = await getAllCallbacks(uiMock.on, 10, async () => await activate(ctx))

            await fns['listPackages'](() => {})

            expect(lspMock.listPackages).toHaveBeenCalled()
        })

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

    describe('LSP events', () => {
        it('Simple redirects', async () => {
            const fns = await getAllCallbacks(lspMock.on, 11, async () => await activate(ctx))

            checkCallback(fns, 'refreshPackages', cmdsMock.refreshPackages)
            checkCallback(fns, 'refreshAsdfSystems', cmdsMock.refreshAsdfSystems)
            checkCallback(fns, 'refreshThreads', cmdsMock.refreshThreads)
            checkCallback(fns, 'refreshInspectors', uiMock.refreshInspectors)
            checkCallback(fns, 'refreshDiagnostics', uiMock.refreshDiagnostics)
            checkCallback(fns, 'output', uiMock.addReplText)
            checkCallback(fns, 'inspectResult', uiMock.newInspector)
            checkCallback(fns, 'inspectUpdate', uiMock.updateInspector)
        })

        it('startCompileTimer', async () => {
            const fns = await getAllCallbacks(lspMock.on, 11, async () => await activate(ctx))

            fns['startCompileTimer']()

            expect(utilsMock.startCompileTimer).toHaveBeenCalled()
        })

        it('getRestartIndex', async () => {
            const fns = await getAllCallbacks(lspMock.on, 11, async () => await activate(ctx))

            await fns['getRestartIndex']({}, () => {})

            expect(uiMock.getRestartIndex).toHaveBeenCalled()
        })

        it('getUserInput', async () => {
            const fns = await getAllCallbacks(lspMock.on, 11, async () => await activate(ctx))

            await fns['getUserInput'](() => {})

            expect(uiMock.getUserInput).toHaveBeenCalled()
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

    describe('updateEditorConfig', () => {
        afterEach(() => {
            vscodeMock.workspace.workspaceFolders = []
        })

        it('No folders', async () => {
            await activate(ctx)
            expect(vscodeMock.workspace.getConfiguration).not.toHaveBeenCalled()
        })

        it('Have folders', async () => {
            const fakeEditorCfg = { update: jest.fn(), get: jest.fn() }
            const fakeLispCfg = { update: jest.fn() }

            vscodeMock.workspace.workspaceFolders = ['foo', 'bar']
            vscodeMock.workspace.getConfiguration.mockImplementationOnce(() => fakeEditorCfg)
            vscodeMock.workspace.getConfiguration.mockImplementationOnce(() => fakeLispCfg)

            await activate(ctx)

            expect(vscodeMock.workspace.getConfiguration).toHaveBeenCalled()
            expect(fakeEditorCfg.update).toHaveBeenCalledWith(
                'formatOnType',
                expect.anything(),
                expect.anything(),
                expect.anything()
            )
            expect(fakeLispCfg.update).toHaveBeenCalledWith(
                'editor.wordSeparators',
                expect.anything(),
                expect.anything(),
                expect.anything()
            )
        })
    })

    describe('Commands', () => {
        it('Simple redirects', async () => {
            const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, 25, async () => await activate(ctx))

            checkCallback(fns, 'alive.selectSexpr', cmdsMock.selectSexpr)
            checkCallback(fns, 'alive.sendToRepl', cmdsMock.sendToRepl)
            checkCallback(fns, 'alive.loadAsdfSystem', cmdsMock.loadAsdfSystem)
            checkCallback(fns, 'alive.compileFile', cmdsMock.compileFile)
            checkCallback(fns, 'alive.refreshPackages', cmdsMock.refreshPackages)
            checkCallback(fns, 'alive.refreshAsdfSystems', cmdsMock.refreshAsdfSystems)
            checkCallback(fns, 'alive.refreshThreads', cmdsMock.refreshThreads)
            checkCallback(fns, 'alive.clearRepl', cmdsMock.clearRepl)
            checkCallback(fns, 'alive.clearInlineResults', cmdsMock.clearInlineResults)
            checkCallback(fns, 'alive.inlineEval', cmdsMock.inlineEval)
            checkCallback(fns, 'alive.loadFile', cmdsMock.loadFile)
            checkCallback(fns, 'alive.inspect', cmdsMock.inspect)
            checkCallback(fns, 'alive.inspectMacro', cmdsMock.inspectMacro)
            checkCallback(fns, 'alive.openScratchPad', cmdsMock.openScratchPad)
            checkCallback(fns, 'alive.macroexpand', cmdsMock.macroexpand)
            checkCallback(fns, 'alive.macroexpand1', cmdsMock.macroexpand1)
        })

        describe('replHistory', () => {
            beforeEach(() => {
                fsMock.promises = {
                    writeFile: jest.fn(),
                }
            })

            it('No items', async () => {
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, 25, async () => await activate(ctx))

                await fns['alive.replHistory']()

                expect(uiMock.selectHistoryItem).toHaveBeenCalled()
            })

            it('One item', async () => {
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, 25, async () => await activate(ctx))

                uiMock.selectHistoryItem.mockReturnValueOnce({ text: 'foo', pkgName: 'bar' })

                await fns['alive.replHistory']()

                expect(uiMock.selectHistoryItem).toHaveBeenCalled()
                expect(uiMock.getHistoryItems).toHaveBeenCalled()
                expect(lspMock.evalFn).toHaveBeenCalled()
            })
        })

        it('clearReplHistory', async () => {
            const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, 25, async () => await activate(ctx))

            fns['alive.clearReplHistory']?.()

            expect(uiMock.clearReplHistory).toHaveBeenCalled()
        })

        const nodeTest = async (
            label: string,
            cbName: string,
            toMock: jest.Mock,
            value: boolean,
            fnData: unknown,
            toCall: jest.Mock
        ) => {
            it(label, async () => {
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, 25, async () => await activate(ctx))

                toMock.mockReturnValue(value)
                toCall.mockReset()

                fns[cbName]?.(fnData)

                value ? expect(toCall).toHaveBeenCalled() : expect(toCall).not.toHaveBeenCalled()
            })
        }

        describe('removePackage', () => {
            packagesMock.isPackageNode = jest.fn()

            nodeTest('Invalid node', 'alive.removePackage', packagesMock.isPackageNode, false, {}, lspMock.removePackage)
            nodeTest(
                'Valid node',
                'alive.removePackage',
                packagesMock.isPackageNode,
                true,
                { label: 'foo' },
                lspMock.removePackage
            )
        })

        describe('removeExport', () => {
            packagesMock.isExportNode = jest.fn()

            nodeTest('Invalid node', 'alive.removeExport', packagesMock.isExportNode, false, {}, lspMock.removeExport)
            nodeTest('Valid node', 'alive.removeExport', packagesMock.isExportNode, true, { label: 'foo' }, lspMock.removeExport)
        })

        describe('killThread', () => {
            threadsMock.isThreadNode = jest.fn()

            nodeTest('Invalid node', 'alive.killThread', threadsMock.isThreadNode, false, {}, lspMock.killThread)
            nodeTest('Valid node', 'alive.killThread', threadsMock.isThreadNode, true, { label: 'foo' }, lspMock.killThread)
        })

        describe('evalHistory', () => {
            nodeTest('Invalid node', 'alive.evalHistory', historyMock.isHistoryNode, false, {}, lspMock.evalFn)
            nodeTest(
                'Valid node',
                'alive.evalHistory',
                historyMock.isHistoryNode,
                true,
                { label: 'foo', item: { text: '', pkgName: '' } },
                lspMock.evalFn
            )
        })

        describe('editHistory', () => {
            nodeTest('Invalid node', 'alive.editHistory', historyMock.isHistoryNode, false, {}, uiMock.setReplInput)
            nodeTest(
                'Valid node',
                'alive.editHistory',
                historyMock.isHistoryNode,
                true,
                { label: 'foo', item: { text: '', pkgName: '' } },
                uiMock.setReplInput
            )
        })

        describe('removeHistory', () => {
            nodeTest('Invalid node', 'alive.removeHistory', historyMock.isHistoryNode, false, {}, uiMock.removeHistoryNode)
            nodeTest(
                'Valid node',
                'alive.removeHistory',
                historyMock.isHistoryNode,
                true,
                { label: 'foo', item: { text: '', pkgName: '' } },
                uiMock.removeHistoryNode
            )
        })

        describe('loadAsdfByName', () => {
            it('Invalid node', async () => {
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, 25, async () => await activate(ctx))

                await fns['alive.loadAsdfByName']({})

                expect(vscodeMock.workspace.saveAll).not.toHaveBeenCalled()
                expect(lspMock.loadAsdfSystem).not.toHaveBeenCalled()
            })

            it('Valid node', async () => {
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, 25, async () => await activate(ctx))

                await fns['alive.loadAsdfByName']({ label: 'foo' })

                expect(vscodeMock.workspace.saveAll).toHaveBeenCalled()
                expect(lspMock.loadAsdfSystem).toHaveBeenCalled()
            })
        })
    })
})
