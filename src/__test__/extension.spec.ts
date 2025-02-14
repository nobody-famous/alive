import { Buffer } from 'buffer'
import { getAllCallbacks } from '../../TestHelpers'
import { activate } from '../extension'
import { COMMON_LISP_ID } from '../vscode/Utils'
import { HistoryItem, HostPort } from '../vscode/Types'
import { LspSpawnOpts } from '../vscode/backend/LspProcess'

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

jest.mock('../vscode/views/AsdfSystemsTree')

const utilsMock = jest.requireMock('../vscode/Utils')
jest.mock('../vscode/Utils')

const procUtilsMock = jest.requireMock('../vscode/backend/ProcUtils')
jest.mock('../vscode/backend/ProcUtils')

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

    const remoteHost = 'foo'
    const remotePort = 1234

    beforeEach(() => {
        jest.restoreAllMocks()

        resetCtx()

        utilsMock.getWorkspaceOrFilePath.mockImplementation(() => '/fake/path')

        configMock.readAliveConfig.mockImplementation(() => ({
            lsp: {
                remote: {
                    host: remoteHost,
                    port: remotePort,
                },
            },
        }))
    })

    describe('Activate', () => {
        it('No extension', async () => {
            vscodeMock.extensions.getExtension.mockReturnValueOnce(undefined)

            await activate(ctx)

            expect(configMock.readAliveConfig).not.toHaveBeenCalled()
        })

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

    describe('Remote connect', () => {
        const getHostPort = () => {
            return new Promise<HostPort>((resolve) => {
                lspMock.connect.mockImplementationOnce((hp: HostPort) => resolve(hp))

                activate(ctx)
            })
        }

        it('Use remote', async () => {
            const hostPort = await getHostPort()

            expect(hostPort?.host).toBe(remoteHost)
        })

        it('Use local', async () => {
            configMock.readAliveConfig.mockImplementation(() => ({
                lsp: {
                    downloadUrl: '/download/url',
                    remote: {
                        host: undefined,
                        port: remotePort,
                    },
                    startCommand: ['cmd'],
                },
            }))

            lspProcMock.downloadLspServer.mockImplementationOnce(() => '/some/path')
            lspProcMock.spawnLspProcess.mockReturnValueOnce({
                child: { stdout: jest.fn(), stderr: jest.fn(), on: jest.fn() },
                port: 4321,
            })

            const hostPort = await getHostPort()

            expect(hostPort?.host).toBe('127.0.0.1')
            expect(hostPort?.port).toBe(4321)
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
            const fns = await getAllCallbacks(uiMock.on, async () => await activate(ctx))

            checkCallback(fns, 'eval', lspMock.evalWithOutput)
            checkCallback(fns, 'inspect', lspMock.inspect)
            checkCallback(fns, 'inspectClosed', lspMock.inspectClosed)
            checkCallback(fns, 'inspectEval', lspMock.inspectEval)
            checkCallback(fns, 'inspectRefresh', lspMock.inspectRefresh)
            checkCallback(fns, 'inspectRefreshMacro', lspMock.inspectRefreshMacro)
            checkCallback(fns, 'inspectMacroInc', lspMock.inspectMacroInc)
        })

        it('listPackages', async () => {
            const fns = await getAllCallbacks(uiMock.on, async () => await activate(ctx))

            await fns['listPackages'](() => {})

            expect(lspMock.listPackages).toHaveBeenCalled()
        })

        const refreshTest = async (validate: () => void) => {
            const fns = await getAllCallbacks(uiMock.on, async () => await activate(ctx))
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
            const fns = await getAllCallbacks(uiMock.on, async () => await activate(ctx))

            fsMock.promises = { writeFile: jest.fn() }
            await fns.saveReplHistory()

            expect(fsMock.promises.writeFile).toHaveBeenCalled()
        })
    })

    describe('LSP events', () => {
        it('Simple redirects', async () => {
            const fns = await getAllCallbacks(lspMock.on, async () => await activate(ctx))

            checkCallback(fns, 'refreshPackages', cmdsMock.refreshPackages)
            checkCallback(fns, 'refreshAsdfSystems', cmdsMock.refreshAsdfSystems)
            checkCallback(fns, 'refreshThreads', cmdsMock.refreshThreads)
            checkCallback(fns, 'refreshInspectors', uiMock.refreshInspectors)
            checkCallback(fns, 'refreshDiagnostics', uiMock.refreshDiagnostics)
            checkCallback(fns, 'output', uiMock.addReplText)
            checkCallback(fns, 'queryText', uiMock.setQueryText)
            checkCallback(fns, 'inspectResult', uiMock.newInspector)
            checkCallback(fns, 'inspectUpdate', uiMock.updateInspector)
        })

        it('startCompileTimer', async () => {
            const fns = await getAllCallbacks(lspMock.on, async () => await activate(ctx))

            fns['startCompileTimer']()

            expect(utilsMock.startCompileTimer).toHaveBeenCalled()
        })

        it('getRestartIndex', async () => {
            const fns = await getAllCallbacks(lspMock.on, async () => await activate(ctx))

            await fns['getRestartIndex']({}, () => {})

            expect(uiMock.getRestartIndex).toHaveBeenCalled()
        })

        it('getUserInput', async () => {
            const fns = await getAllCallbacks(lspMock.on, async () => await activate(ctx))

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

            fn?.({ document: {} })

            expect(lspMock.textDocumentChanged).toHaveBeenCalled()
        })

        it('onDidChangeConfiguration', async () => {
            const fn = await getHandler(vscodeMock.workspace.onDidChangeConfiguration)

            fn?.()

            expect(lspMock.listPackages).toHaveBeenCalled()
        })

        it('onDidChangeActiveTextEditor', async () => {
            const fn = await getHandler(vscodeMock.window.onDidChangeActiveTextEditor)

            lspMock.editorChanged.mockReset()

            fn?.()
            expect(lspMock.editorChanged).not.toHaveBeenCalled()

            fn?.({ document: {} })
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
            vscodeMock.extensions.getExtension.mockReturnValueOnce({})

            lspMock.connect.mockReset()
            lspProcMock.downloadLspServer.mockReset()
            lspProcMock.spawnLspProcess.mockReset()
        })

        it('Start OK', async () => {
            configMock.readAliveConfig.mockImplementation(() => ({
                lsp: {
                    downloadUrl: '/some/url',
                    startCommand: ['cmd'],
                },
            }))
            lspProcMock.downloadLspServer.mockReturnValueOnce('/some/path')
            lspProcMock.spawnLspProcess.mockReturnValueOnce({
                child: { stdout: jest.fn(), stderr: jest.fn(), on: jest.fn() },
                port: 4321,
            })

            await activate(ctx)

            expect(lspProcMock.downloadLspServer).toHaveBeenCalled()
            expect(lspMock.connect).toHaveBeenCalled()
        })

        it('Start Invalid Port', async () => {
            configMock.readAliveConfig.mockImplementation(() => ({
                lsp: {
                    downloadUrl: '/some/url',
                    startCommand: ['cmd'],
                },
            }))
            lspProcMock.downloadLspServer.mockReturnValueOnce('/some/path')
            lspProcMock.spawnLspProcess.mockReturnValueOnce({
                child: { stdout: jest.fn(), stderr: jest.fn(), on: jest.fn() },
                port: NaN,
            })

            await activate(ctx)

            expect(lspProcMock.downloadLspServer).toHaveBeenCalled()
            expect(lspMock.connect).not.toHaveBeenCalled()
        })

        it('Start Invalid Path', async () => {
            configMock.readAliveConfig.mockImplementation(() => ({
                lsp: {
                    downloadUrl: '/some/url',
                    startCommand: ['cmd'],
                },
            }))
            lspProcMock.downloadLspServer.mockReturnValueOnce(5)

            expect(async () => await activate(ctx)).rejects.toThrow()

            expect(lspProcMock.downloadLspServer).not.toHaveBeenCalled()
            expect(lspMock.connect).not.toHaveBeenCalled()
        })

        it('Have install path', async () => {
            configMock.readAliveConfig.mockImplementation(() => ({
                lsp: {
                    downloadUrl: '/some/url',
                    startCommand: ['cmd'],
                },
            }))
            lspProcMock.getInstallPath.mockReturnValueOnce('/install/path')
            lspProcMock.downloadLspServer.mockReturnValueOnce(5)
            lspProcMock.spawnLspProcess.mockReturnValueOnce({
                child: { stdout: jest.fn(), stderr: jest.fn(), on: jest.fn() },
            })

            await activate(ctx)

            expect(lspProcMock.downloadLspServer).not.toHaveBeenCalled()
            expect(lspMock.connect).not.toHaveBeenCalled()
        })

        it('No url', async () => {
            configMock.readAliveConfig.mockImplementation(() => ({ lsp: { downloadUrl: undefined } }))
            lspProcMock.downloadLspServer.mockReturnValueOnce(5)

            expect(async () => await activate(ctx)).rejects.toThrow()

            expect(lspProcMock.downloadLspServer).not.toHaveBeenCalled()
            expect(lspMock.connect).not.toHaveBeenCalled()
        })

        it('Bad command', async () => {
            configMock.readAliveConfig.mockImplementation(() => ({
                lsp: { downloadUrl: '/some/url', startCommand: [] },
            }))
            lspProcMock.downloadLspServer.mockReturnValueOnce('/some/path')

            expect(async () => await activate(ctx)).rejects.toThrow()

            expect(lspProcMock.downloadLspServer).not.toHaveBeenCalled()
            expect(lspMock.connect).not.toHaveBeenCalled()
        })

        it('Bad spawn', async () => {
            configMock.readAliveConfig.mockImplementation(() => ({
                lsp: { downloadUrl: '/some/url', startCommand: ['cmd'] },
            }))
            lspProcMock.downloadLspServer.mockReturnValueOnce('/some/path')
            lspProcMock.spawnLspProcess.mockImplementationOnce(() => {
                throw new Error('Failed, as requested')
            })

            expect(async () => await activate(ctx)).rejects.toThrow()

            expect(lspProcMock.downloadLspServer).not.toHaveBeenCalled()
            expect(lspMock.connect).not.toHaveBeenCalled()
        })

        const getSpawnCallbacks = async (): Promise<{
            cbs: Record<string, () => Promise<void>>
            opts: LspSpawnOpts | undefined
        }> => {
            const cbs: Record<string, () => Promise<void>> = {}
            let opts: LspSpawnOpts | undefined

            configMock.readAliveConfig.mockImplementation(() => ({
                lsp: { downloadUrl: '/some/url', startCommand: ['cmd'] },
            }))
            lspProcMock.downloadLspServer.mockReturnValueOnce('/some/path')
            lspProcMock.spawnLspProcess.mockImplementationOnce((spawnOpts: LspSpawnOpts) => {
                opts = spawnOpts
                return {
                    child: {
                        stdout: jest.fn(),
                        stderr: jest.fn(),
                        on: jest.fn((name, fn) => {
                            cbs[name] = fn
                        }),
                    },
                }
            })

            await activate(ctx)

            return { cbs, opts }
        }

        it('Spawn error', async () => {
            const { opts } = await getSpawnCallbacks()

            opts?.onError(new Error('Failed, as requested'))
            expect(vscodeMock.window.showErrorMessage).toHaveBeenCalled()
        })

        describe('disconnect', () => {
            it('Multiple disconnect calls', async () => {
                const { cbs } = await getSpawnCallbacks()

                await cbs['disconnect']?.()
                expect(procUtilsMock.disconnectChild).toHaveBeenCalled()

                procUtilsMock.disconnectChild.mockReset()
                await cbs['disconnect']?.()
                expect(procUtilsMock.disconnectChild).not.toHaveBeenCalled()
            })

            it('Disconnect error', async () => {
                const { cbs } = await getSpawnCallbacks()

                procUtilsMock.disconnectChild.mockImplementationOnce(() => {
                    throw new Error('Failed, as requested')
                })
                await cbs['disconnect']?.()
                expect(vscodeMock.window.showWarningMessage).toHaveBeenCalled()
            })
        })
    })

    describe('Commands', () => {
        it('Simple redirects', async () => {
            const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, async () => await activate(ctx))

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

            for (let index = 0; index <= 9; index++) {
                fns[`alive.restart_${index}`]()
                expect(cmdsMock.selectRestart).toHaveBeenCalledWith(expect.anything(), index)
            }
        })

        describe('replHistory', () => {
            beforeEach(() => {
                fsMock.promises = {
                    writeFile: jest.fn(),
                }
            })

            it('No items', async () => {
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, async () => await activate(ctx))

                await fns['alive.replHistory']()

                expect(uiMock.selectHistoryItem).toHaveBeenCalled()
            })

            it('One item', async () => {
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, async () => await activate(ctx))

                uiMock.selectHistoryItem.mockReturnValueOnce({ text: 'foo', pkgName: 'bar' })

                await fns['alive.replHistory']()

                expect(uiMock.selectHistoryItem).toHaveBeenCalled()
                expect(uiMock.getHistoryItems).toHaveBeenCalled()
                expect(lspMock.evalWithOutput).toHaveBeenCalled()
            })
        })

        it('clearReplHistory', async () => {
            const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, async () => await activate(ctx))

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
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, async () => await activate(ctx))

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
            nodeTest('Invalid node', 'alive.evalHistory', historyMock.isHistoryNode, false, {}, lspMock.evalWithOutput)
            nodeTest(
                'Valid node',
                'alive.evalHistory',
                historyMock.isHistoryNode,
                true,
                { label: 'foo', item: { text: '', pkgName: '' } },
                lspMock.evalWithOutput
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
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, async () => await activate(ctx))

                await fns['alive.loadAsdfByName']({})

                expect(vscodeMock.workspace.saveAll).not.toHaveBeenCalled()
                expect(lspMock.loadAsdfSystem).not.toHaveBeenCalled()
            })

            it('Valid node', async () => {
                const fns = await getAllCallbacks(vscodeMock.commands.registerCommand, async () => await activate(ctx))

                await fns['alive.loadAsdfByName']({ label: 'foo' })

                expect(vscodeMock.workspace.saveAll).toHaveBeenCalled()
                expect(lspMock.loadAsdfSystem).toHaveBeenCalled()
            })
        })
    })
})
