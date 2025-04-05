import { title } from 'process'
import { getAllCallbacks, getCallback } from '../../../TestHelpers'
import { HistoryItem, Package, RestartInfo } from '../Types'
import { UI, UIState } from '../UI'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const replMock = jest.requireMock('../views/LispRepl')
jest.mock('../views/LispRepl')

const debugMock = jest.requireMock('../views/DebugView')
jest.mock('../views/DebugView')

const inspectorPanelMock = jest.requireMock('../views/InspectorPanel')
jest.mock('../views/InspectorPanel')

const inspectorMock = jest.requireMock('../views/Inspector')
jest.mock('../views/Inspector')

const historyMock = jest.requireMock('../views/ReplHistory')
jest.mock('../views/ReplHistory')

const packagesMock = jest.requireMock('../views/PackagesTree')
jest.mock('../views/PackagesTree')

const asdfMock = jest.requireMock('../views/AsdfSystemsTree')
jest.mock('../views/AsdfSystemsTree')

const threadsMock = jest.requireMock('../views/ThreadsTree')
jest.mock('../views/ThreadsTree')

const createState = (): UIState => {
    const state: UIState = {
        ctx: { subscriptions: [], extensionPath: 'foo' },
        config: { packageTree: { separator: null } },
        extension: vscodeMock.extensions.getExtension(),
    }

    return state
}

describe('UI tests', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        vscodeMock.window.showTextDocument.mockImplementation(() => ({
            selection: {},
            revealRange: jest.fn(),
        }))
    })

    it('clearRepl', () => {
        const state = createState()
        const ui = new UI(state)

        ui.clearRepl()
    })

    describe('initRepl', () => {
        describe('eval', () => {
            it('No history', async () => {
                const ui = new UI(createState())
                const evalFn = await getCallback(replMock.replOn, () => ui.initRepl(), 'eval')

                let evalPkg: string | undefined
                let evalText: string | undefined

                ui.on('eval', (pkg: string, text: string) => {
                    evalPkg = pkg
                    evalText = text
                })

                expect(evalFn).not.toBeUndefined()
                evalFn?.('foo', 'bar')

                expect(evalPkg).toBe('bar')
                expect(evalText).toBe('foo')
            })
        })

        describe('historyUp', () => {
            it('No history', async () => {
                const ui = new UI(createState())
                const fn = await getCallback(replMock.replOn, () => ui.initRepl(), 'historyUp')

                fn?.()

                expect(historyMock.getCurrentItem).toHaveBeenCalled()
                expect(replMock.replClearInput).toHaveBeenCalled()
            })

            it('Have history', async () => {
                const ui = new UI(createState())
                const fn = await getCallback(replMock.replOn, () => ui.initRepl(), 'historyUp')

                historyMock.getCurrentItem.mockReturnValueOnce({ pkgName: 'foo', text: 'bar' })

                fn?.()

                expect(historyMock.incrementIndex).toHaveBeenCalled()
                expect(replMock.replClearInput).not.toHaveBeenCalled()
                expect(replMock.replSetInput).toHaveBeenCalledWith('bar')
            })
        })

        describe('historyDown', () => {
            it('No history', async () => {
                const ui = new UI(createState())
                const fn = await getCallback(replMock.replOn, () => ui.initRepl(), 'historyDown')

                fn?.()

                expect(historyMock.decrementIndex).toHaveBeenCalled()
                expect(replMock.replClearInput).toHaveBeenCalled()
            })

            it('Have history', async () => {
                const ui = new UI(createState())
                const fn = await getCallback(replMock.replOn, () => ui.initRepl(), 'historyDown')

                historyMock.getCurrentItem.mockReturnValueOnce({ pkgName: 'foo', text: 'bar' })

                fn?.()

                expect(historyMock.decrementIndex).toHaveBeenCalled()
                expect(replMock.replClearInput).not.toHaveBeenCalled()
                expect(replMock.replSetInput).toHaveBeenCalledWith('bar')
            })
        })

        describe('requestPackage', () => {
            const runTest = async (pkgs: Package[], validate: () => void) => {
                const state = createState()
                const ui = new UI(state)
                const fn = await getCallback(replMock.replOn, () => ui.initRepl(), 'requestPackage')

                ui.on('listPackages', async (fn) => fn(pkgs))

                await fn?.()

                validate()
            }

            it('No packages', async () => {
                await runTest([], () => {
                    expect(vscodeMock.window.showQuickPick).toHaveBeenCalled()
                    expect(replMock.replSetPackage).not.toHaveBeenCalled()
                })
            })

            it('One package', async () => {
                vscodeMock.window.showQuickPick.mockImplementationOnce((names: string[]) => names[0])

                await runTest([{ name: 'foo', exports: [], nicknames: [] }], () => {
                    expect(vscodeMock.window.showQuickPick).toHaveBeenCalledWith(['foo'], expect.anything())
                    expect(replMock.replSetPackage).toHaveBeenCalledWith('foo')
                })
            })

            it('One package nickname', async () => {
                vscodeMock.window.showQuickPick.mockImplementationOnce((names: string[]) => names[0])

                await runTest([{ name: 'foo', exports: [], nicknames: ['bar'] }], () => {
                    expect(vscodeMock.window.showQuickPick).toHaveBeenCalledWith(['bar', 'foo'], expect.anything())
                    expect(replMock.replSetPackage).toHaveBeenCalledWith('bar')
                })
            })
        })
    })

    describe('initInspectorPanel', () => {
        it('inspect', async () => {
            const ui = new UI(createState())
            const fn = await getCallback(inspectorPanelMock.inspectPanelOn, async () => ui.initInspectorPanel(), 'inspect')

            let pkg: string = ''
            let text: string = ''

            ui.on('inspect', (p, t) => {
                pkg = p
                text = t
            })

            await fn?.('foo', 'bar')

            expect(pkg).toBe('bar')
            expect(text).toBe('foo')
        })

        it('Inspector requestPackage', async () => {
            const ui = new UI(createState())
            const fn = await getCallback(inspectorPanelMock.inspectPanelOn, async () => ui.initInspectorPanel(), 'requestPackage')

            ui.on('listPackages', (fn) => fn([]))

            await fn?.()

            expect(vscodeMock.window.showQuickPick).toHaveBeenCalled()
        })
    })

    it('updateInspector', () => {
        const ui = new UI(createState())
        const info = { id: 5, resultType: 'foo', result: 'bar' }

        ui.updateInspector(info)
        expect(inspectorMock.inspectorShow).not.toHaveBeenCalled()

        ui.newInspector({ ...info, text: 'bar', package: 'foo' })
        ui.updateInspector(info)
        expect(inspectorMock.inspectorShow).toHaveBeenCalled()
    })

    it('refreshInspectors', () => {
        const ui = new UI(createState())
        const cb = jest.fn()
        const fakes = [
            { on: jest.fn(), show: jest.fn() },
            { on: jest.fn(), show: jest.fn() },
            { on: jest.fn(), show: jest.fn() },
        ]

        for (let n = 0; n < fakes.length; n++) {
            inspectorMock.Inspector.mockImplementationOnce(() => fakes[n])
        }

        for (let n = 0; n < fakes.length; n++) {
            ui.newInspector({ id: 5 + n, resultType: 'foo', result: 'bar', text: 'bar', package: 'foo' })
        }

        ui.on('inspectRefresh', cb)

        ui.refreshInspectors()
        expect(cb).toHaveBeenCalledTimes(3)
    })

    describe('newInspector', () => {
        const info = { id: 5, resultType: 'foo', result: 'bar', text: 'bar', package: 'foo' }

        it('inspectorClosed', async () => {
            const ui = new UI(createState())
            const cb = jest.fn()
            const fake = { on: jest.fn().mockImplementation(() => console.log('ON CALLED')), show: jest.fn() }

            inspectorMock.Inspector.mockImplementationOnce(() => fake)

            const fn = await getCallback(fake.on, async () => ui.newInspector(info), 'inspectorClosed')

            ui.on('inspectClosed', cb)
            fn?.()

            expect(cb).toHaveBeenCalled()
        })

        it('callbacks', async () => {
            const ui = new UI(createState())
            const fns = await getAllCallbacks(inspectorMock.inspectorOn, async () => ui.newInspector(info))
            const called: { [index: string]: boolean } = {
                inspectEval: false,
                inspectRefresh: false,
                inspectRefreshMacro: false,
                inspectMacroInc: false,
            }

            ui.on('inspectEval', () => (called.inspectEval = true))
            ui.on('inspectRefresh', () => (called.inspectRefresh = true))
            ui.on('inspectRefreshMacro', () => (called.inspectRefreshMacro = true))
            ui.on('inspectMacroInc', () => (called.inspectMacroInc = true))

            fns['inspectorEval']('foo')
            expect(called['inspectEval']).toBe(true)

            fns['inspectorRefresh']()
            expect(called['inspectRefresh']).toBe(true)

            fns['inspectorRefreshMacro']()
            expect(called['inspectRefreshMacro']).toBe(true)

            fns['inspectorMacroInc']()
            expect(called['inspectMacroInc']).toBe(true)
        })
    })

    it('refreshDiagnostics', () => {
        const ui = new UI(createState())
        const cb = jest.fn()

        ui.on('diagnosticsRefresh', cb)

        ui.refreshDiagnostics()
        expect(cb).toHaveBeenCalled()
    })

    it('addReplInput', () => {
        const ui = new UI(createState())
        let text = ''

        replMock.replAddInputText.mockImplementationOnce((str: string, pkgName: string) => (text = `${pkgName}> ${str}`))
        ui.addReplInput('foo', 'user')

        expect(text).toBe('user> foo')
    })

    it('addReplOutput', () => {
        const ui = new UI(createState())
        let text = ''

        replMock.replAddOutputText.mockImplementationOnce((str: string) => (text = str))
        ui.addReplOutput('foo')

        expect(text).toBe('foo')
    })

    it('setQueryText', async () => {
        const ui = new UI(createState())
        let boxTitle: string = ''

        vscodeMock.window.showInputBox.mockImplementationOnce(({ title }: { title: string }) => {
            boxTitle = title
        })

        ui.setQueryText('foo')
        await ui.getUserInput()

        expect(boxTitle).toBe('foo')
    })

    describe('selectHistoryItem', () => {
        interface QP {
            items: HistoryItem[]
            onDidChangeSelection: jest.Mock
            onDidHide: jest.Mock
            show: jest.Mock
        }

        interface QPItem {
            label: string
            description?: string
        }

        interface ChangeFnResult {
            task: Promise<HistoryItem | undefined>
            fn: ((e: QPItem[]) => void) | undefined
        }

        interface HideFnResult {
            task: Promise<HistoryItem | undefined>
            fn: (() => void) | undefined
        }

        const getChangeFn = (ui: UI, qp: QP): ChangeFnResult => {
            let changeFn = undefined

            qp.onDidChangeSelection.mockImplementationOnce((fn) => (changeFn = fn))
            vscodeMock.window.createQuickPick.mockImplementationOnce(() => qp)

            const task = ui.selectHistoryItem()

            return { task, fn: changeFn }
        }

        it('One item', async () => {
            const ui = new UI(createState())

            const qp = {
                items: [{ text: '', pkgName: '' }],
                onDidChangeSelection: jest.fn(),
                onDidHide: jest.fn(),
                hide: jest.fn(),
                show: jest.fn(),
                dispose: jest.fn(),
            }

            try {
                vscodeMock.window.createQuickPick.mockReset()
                historyMock.getItems.mockImplementationOnce(() => [{ text: '', pkgName: '' }])
                vscodeMock.window.createQuickPick.mockImplementationOnce(() => qp)

                const { task, fn } = getChangeFn(ui, qp)

                fn?.([])
                expect(qp.show).toHaveBeenCalled()
                expect(qp.hide).not.toHaveBeenCalled()

                fn?.([{ label: 'foo' }])
                expect(qp.hide).toHaveBeenCalled()
                expect(historyMock.moveItemToTop).toHaveBeenCalled()

                fn?.([{ label: 'foo', description: 'bar' }])
                expect(qp.hide).toHaveBeenCalled()
                expect(historyMock.moveItemToTop).toHaveBeenCalled()

                const item = await task
                expect(item?.text).toBe('foo')
                expect(item?.pkgName).toBe('')
            } finally {
                historyMock.items = []
            }
        })

        const getHideFn = async (): Promise<HideFnResult> => {
            let hideFn = undefined
            const ui = new UI(createState())
            const qp = {
                items: [],
                onDidChangeSelection: jest.fn(),
                onDidHide: jest.fn((fn) => (hideFn = fn)),
                dispose: jest.fn(),
                show: jest.fn(),
            }

            vscodeMock.window.createQuickPick.mockReset()
            historyMock.getItems.mockImplementationOnce(() => [{ text: '', pkgName: '' }])
            vscodeMock.window.createQuickPick.mockImplementationOnce(() => qp)

            const task = ui.selectHistoryItem()

            return { task, fn: hideFn }
        }

        it('Hide quickpick', async () => {
            const { task, fn } = await getHideFn()

            fn?.()

            const result = await task

            expect(result).toBeUndefined()
        })
    })

    it('moveHistoryNodeToTop', () => {
        const ui = new UI(createState())

        ui.moveHistoryNodeToTop(new historyMock.HistoryNode({}))
        expect(historyMock.moveToTop).toHaveBeenCalled()
    })

    it('removeHistoryNode', () => {
        const ui = new UI(createState())

        ui.removeHistoryNode(new historyMock.HistoryNode({}))
        expect(historyMock.removeNode).toHaveBeenCalled()
    })

    it('getHistoryItems', () => {
        const ui = new UI(createState())

        historyMock.getItems.mockImplementationOnce(() => [])
        expect(ui.getHistoryItems()).toMatchObject([])
    })

    const initTreeTest = (name: string, initFn: (ui: UI) => void, obj: { update: jest.Mock }) => {
        const ui = new UI(createState())

        initFn(ui)

        expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalledWith(name, expect.anything())
        expect(obj.update).toHaveBeenCalled()
    }

    it('initThreadsTree', () => {
        initTreeTest('lispThreads', (ui) => ui.initThreadsTree([]), threadsMock)
    })

    it('initAsdfSystemsTree', () => {
        initTreeTest('asdfSystems', (ui) => ui.initAsdfSystemsTree([]), asdfMock)
    })

    it('initHistoryTree', () => {
        initTreeTest('replHistory', (ui) => ui.initHistoryTree([]), historyMock)
    })

    it('initPackagesTree', () => {
        initTreeTest('lispPackages', (ui) => ui.initPackagesTree([]), packagesMock)
    })

    it('initInspector', () => {
        const ui = new UI(createState())

        ui.initInspector()
        expect(vscodeMock.window.registerWebviewViewProvider).toHaveBeenCalledWith('lispInspector', expect.anything())
    })

    const updateTreeTest = (initFn: (ui: UI) => void, obj: { update: jest.Mock }) => {
        const ui = new UI(createState())

        initFn(ui)

        expect(obj.update).toHaveBeenCalled()
    }

    it('updatePackages', () => {
        updateTreeTest((ui) => ui.updatePackages([]), packagesMock)
    })

    it('updateAsdfSystems', () => {
        updateTreeTest((ui) => ui.updateAsdfSystems([]), asdfMock)
    })

    it('updateThreads', () => {
        updateTreeTest((ui) => ui.updateThreads([]), threadsMock)
    })

    it('getUserInput', async () => {
        const ui = new UI(createState())

        vscodeMock.window.showInputBox.mockReturnValueOnce('foo')
        const text = await ui.getUserInput()

        expect(text).toBe('foo')
    })

    describe('getRestartIndex', () => {
        it('restart index', async () => {
            const ui = new UI(createState())
            const info = {
                message: 'foo',
                restarts: [
                    { name: 'foo', description: 'foo' },
                    { name: 'bar', description: 'bar' },
                ],
                stackTrace: [],
            }
            let task: Promise<number | undefined> | undefined = undefined
            const fns = await getAllCallbacks(debugMock.debugOn, async () => {
                task = ui.getRestartIndex(info)
            })

            fns['jumpTo']('bar', 5, 10)
            fns['restart'](5)
            fns['restart'](1)
            fns['debugClosed']()

            const index = await task

            expect(index).toBe(1)
            expect(vscodeMock.workspace.openTextDocument).toHaveBeenCalledWith('bar')
            expect(vscodeMock.window.showTextDocument).toHaveBeenCalled()
            expect(debugMock.debugRun).toHaveBeenCalled()
            expect(debugMock.debugStop).toHaveBeenCalled()
        })

        const closedTest = async (restarts: RestartInfo[], expectIndex: number | undefined) => {
            const ui = new UI(createState())
            const info = {
                message: 'foo',
                restarts,
                stackTrace: [],
            }
            let task: Promise<number | undefined> | undefined = undefined
            const fns = await getAllCallbacks(debugMock.debugOn, async () => {
                task = ui.getRestartIndex(info)
            })

            fns['debugClosed']()

            const index = await task

            expect(index).toBe(expectIndex)
            expect(debugMock.debugRun).toHaveBeenCalled()
            expect(debugMock.debugStop).toHaveBeenCalled()
        }

        it('debugClosed', async () => {
            await closedTest(
                [
                    { name: 'foo', description: '' },
                    { name: 'abort', description: '' },
                    { name: 'bar', description: '' },
                ],
                1
            )
        })

        it('debugClosed fail', async () => {
            await closedTest([], undefined)
        })
    })

    it('setReplInput', () => {
        const ui = new UI(createState())

        ui.setReplInput('foo')
        expect(replMock.replSetInput).toHaveBeenCalledWith('foo')
    })

    it('setReplPackage', () => {
        const ui = new UI(createState())

        ui.setReplPackage('foo')
        expect(replMock.replSetPackage).toHaveBeenCalledWith('foo')
    })

    it('clearReplHistory', () => {
        const ui = new UI(createState())

        ui.clearReplHistory()
        expect(historyMock.clear).toHaveBeenCalled()
    })

    it('registerProviders', () => {
        const ui = new UI(createState())

        ui.registerProviders()
        expect(vscodeMock.window.registerWebviewViewProvider).toHaveBeenCalledWith('lispRepl', expect.anything())
    })

    it('init', () => {
        const ui = new UI(createState())

        ui.init()
    })

    describe('selectRestart', () => {
        it('No views', () => {
            const ui = new UI(createState())
            ui.selectRestart(3)
        })

        it('No panel for view', () => {
            const ui = new UI(createState())
            const info = { message: 'foo', restarts: [], stackTrace: [] }

            ui.getRestartIndex(info)

            const panel = debugMock.fake.panel
            try {
                debugMock.fake.panel = undefined
                ui.selectRestart(3)
            } finally {
                debugMock.fake.panel = panel
            }
        })

        it('Has view', () => {
            const ui = new UI(createState())
            const info = { message: 'foo', restarts: [], stackTrace: [] }

            ui.getRestartIndex(info)
            ui.selectRestart(3)

            debugMock.debugPanel.visible = true
            ui.selectRestart(3)

            expect(debugMock.debugSelectRestart).toHaveBeenCalled()
        })
    })
})
