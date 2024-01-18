import { HistoryItem, RestartInfo } from '../Types'
import { UI, UIState } from '../UI'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const replMock = jest.requireMock('../views/LispRepl')
jest.mock('../views/LispRepl')

const debugObj = {
    on: jest.fn(),
    run: jest.fn(),
    stop: jest.fn(),
}
jest.mock('../views/DebugView', () => ({
    DebugView: jest.fn().mockImplementation(() => debugObj),
}))

const inspectorPanelObj = {
    on: jest.fn(),
}
jest.mock('../views/InspectorPanel', () => ({
    InspectorPanel: jest.fn().mockImplementation(() => inspectorPanelObj),
}))

const inspectorObj = {
    on: jest.fn(),
    show: jest.fn(),
    update: jest.fn(),
}
const inspectorModuleMock = jest.requireMock('../views/Inspector')
jest.mock('../views/Inspector', () => ({
    Inspector: jest.fn().mockImplementation(() => inspectorObj),
}))

const historyObj: {
    items: HistoryItem[]
    clear: jest.Mock
    clearIndex: jest.Mock
    incrementIndex: jest.Mock
    decrementIndex: jest.Mock
    getCurrentItem: jest.Mock
    moveItemToTop: jest.Mock
    moveToTop: jest.Mock
    removeItem: jest.Mock
    removeNode: jest.Mock
    addItem: jest.Mock
    update: jest.Mock
} = {
    items: [],
    clear: jest.fn(),
    clearIndex: jest.fn(),
    incrementIndex: jest.fn(),
    decrementIndex: jest.fn(),
    getCurrentItem: jest.fn(),
    moveItemToTop: jest.fn(),
    moveToTop: jest.fn(),
    removeItem: jest.fn(),
    removeNode: jest.fn(),
    addItem: jest.fn(),
    update: jest.fn(),
}
const replHistory = jest.requireMock('../views/ReplHistory')
jest.mock('../views/ReplHistory', () => ({
    HistoryNode: jest.fn(),
    ReplHistoryTreeProvider: jest.fn().mockImplementation(() => historyObj),
}))

const packagesObj = {
    update: jest.fn(),
}
jest.mock('../views/PackagesTree', () => ({
    PackagesTreeProvider: jest.fn().mockImplementation(() => packagesObj),
}))

const asdfObj = {
    update: jest.fn(),
}
jest.mock('../views/AsdfSystemsTree', () => ({
    AsdfSystemsTreeProvider: jest.fn().mockImplementation(() => asdfObj),
}))

const threadsObj = {
    update: jest.fn(),
}
jest.mock('../views/ThreadsTree', () => ({
    ThreadsTreeProvider: jest.fn().mockImplementation(() => threadsObj),
}))

const createState = (): UIState => {
    const state: UIState = {
        ctx: { subscriptions: [], extensionPath: 'foo' },
    }

    return state
}

const getCallback = (
    toMock: jest.Mock,
    mockCount: number,
    initFn: () => void,
    name: string
): ((...args: unknown[]) => void) | undefined => {
    let callback = undefined
    const onFn = (label: string, fn: (...args: unknown[]) => void) => {
        if (name === label) {
            callback = fn
        }
    }

    for (let count = 0; count < mockCount; count++) {
        toMock.mockImplementation(onFn)
    }

    initFn()

    return callback
}
const getAllCallbacks = (
    obj: { on: jest.Mock },
    mockCount: number,
    initFn: () => void
): { [index: string]: (...args: unknown[]) => void } => {
    const callbacks: { [index: string]: (...args: unknown[]) => void } = {}
    const onFn = (label: string, fn: (...args: unknown[]) => void) => {
        callbacks[label] = fn
    }

    for (let count = 0; count < mockCount; count++) {
        obj.on.mockImplementationOnce(onFn)
    }

    initFn()

    return callbacks
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
            it('No history', () => {
                const ui = new UI(createState())
                const evalFn = getCallback(replMock.replOn, 4, () => ui.initRepl(), 'eval')

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
            it('No history', () => {
                const ui = new UI(createState())
                const fn = getCallback(replMock.replOn, 4, () => ui.initRepl(), 'historyUp')

                fn?.()

                expect(historyObj.incrementIndex).toHaveBeenCalled()
                expect(replMock.replClearInput).toHaveBeenCalled()
            })

            it('Have history', () => {
                const ui = new UI(createState())
                const fn = getCallback(replMock.replOn, 4, () => ui.initRepl(), 'historyUp')

                historyObj.getCurrentItem.mockReturnValueOnce({ pkgName: 'foo', text: 'bar' })

                fn?.()

                expect(historyObj.incrementIndex).toHaveBeenCalled()
                expect(replMock.replClearInput).not.toHaveBeenCalled()
                expect(replMock.replSetPackage).toHaveBeenCalledWith('foo')
                expect(replMock.replSetInput).toHaveBeenCalledWith('bar')
            })
        })

        describe('historyDown', () => {
            it('No history', () => {
                const ui = new UI(createState())
                const fn = getCallback(replMock.replOn, 4, () => ui.initRepl(), 'historyDown')

                fn?.()

                expect(historyObj.decrementIndex).toHaveBeenCalled()
                expect(replMock.replClearInput).toHaveBeenCalled()
            })

            it('Have history', () => {
                const ui = new UI(createState())
                const fn = getCallback(replMock.replOn, 4, () => ui.initRepl(), 'historyDown')

                historyObj.getCurrentItem.mockReturnValueOnce({ pkgName: 'foo', text: 'bar' })

                fn?.()

                expect(historyObj.decrementIndex).toHaveBeenCalled()
                expect(replMock.replClearInput).not.toHaveBeenCalled()
                expect(replMock.replSetPackage).toHaveBeenCalledWith('foo')
                expect(replMock.replSetInput).toHaveBeenCalledWith('bar')
            })
        })

        describe('requestPackage', () => {
            const runTest = async (pkgs: unknown[], validate: () => void) => {
                const state = createState()
                const ui = new UI(state)
                const fn = getCallback(replMock.replOn, 4, () => ui.initRepl(), 'requestPackage')

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

                await runTest([{ name: 'foo', nicknames: [] }], () => {
                    expect(vscodeMock.window.showQuickPick).toHaveBeenCalledWith(['foo'], expect.anything())
                    expect(replMock.replSetPackage).toHaveBeenCalledWith('foo')
                })
            })

            it('One package nickname', async () => {
                vscodeMock.window.showQuickPick.mockImplementationOnce((names: string[]) => names[0])

                await runTest([{ name: 'foo', nicknames: ['bar'] }], () => {
                    expect(vscodeMock.window.showQuickPick).toHaveBeenCalledWith(['bar', 'foo'], expect.anything())
                    expect(replMock.replSetPackage).toHaveBeenCalledWith('bar')
                })
            })
        })
    })

    describe('initInspectorPanel', () => {
        it('inspect', async () => {
            const ui = new UI(createState())
            const fn = getCallback(inspectorPanelObj.on, 2, () => ui.initInspectorPanel(), 'inspect')

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
            const fn = getCallback(inspectorPanelObj.on, 2, () => ui.initInspectorPanel(), 'requestPackage')

            ui.on('listPackages', (fn) => fn([]))

            await fn?.()

            expect(vscodeMock.window.showQuickPick).toHaveBeenCalled()
        })
    })

    it('updateInspector', () => {
        const ui = new UI(createState())
        const info = { id: 5, resultType: 'foo', result: 'bar' }

        ui.updateInspector(info)
        expect(inspectorObj.show).not.toHaveBeenCalled()

        ui.newInspector({ ...info, text: 'bar', package: 'foo' })
        ui.updateInspector(info)
        expect(inspectorObj.show).toHaveBeenCalled()
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
            inspectorModuleMock.Inspector.mockImplementationOnce(() => fakes[n])
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

        it('inspectorClosed', () => {
            const ui = new UI(createState())
            const cb = jest.fn()
            const fake = { on: jest.fn().mockImplementation(() => console.log('ON CALLED')), show: jest.fn() }

            inspectorModuleMock.Inspector.mockImplementationOnce(() => fake)

            const fn = getCallback(fake.on, 5, () => ui.newInspector(info), 'inspectorClosed')

            ui.on('inspectClosed', cb)
            fn?.()

            expect(cb).toHaveBeenCalled()
        })

        it('callbacks', () => {
            const ui = new UI(createState())
            const fns = getAllCallbacks(inspectorObj, 54, () => ui.newInspector(info))
            const called: { [index: string]: boolean } = {
                inspectEval: false,
                inspectRefresh: false,
                inspectRefreshMacro: false,
                inspectMacroInc: false,
            }

            for (const name of Object.keys(called)) {
                ui.on(name, () => (called[name] = true))
            }

            fns['inspector-eval']('foo')
            expect(called['inspectEval']).toBe(true)

            fns['inspector-refresh']()
            expect(called['inspectRefresh']).toBe(true)

            fns['inspector-refresh-macro']()
            expect(called['inspectRefreshMacro']).toBe(true)

            fns['inspector-macro-inc']()
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

    it('addReplText', () => {
        const ui = new UI(createState())
        let text = ''

        replMock.replAddText.mockImplementationOnce((str: string) => (text = str))
        ui.addReplText('foo')

        expect(text).toBe('foo')
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
            task: Promise<HistoryItem>
            fn: ((e: QPItem[]) => void) | undefined
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
                onDidHide: jest.fn().mockImplementation((fn: () => void) => fn()),
                hide: jest.fn(),
                show: jest.fn(),
                dispose: jest.fn(),
            }

            try {
                historyObj.items = [{ text: '', pkgName: '' }]
                vscodeMock.window.createQuickPick.mockImplementationOnce(() => qp)

                const { task, fn } = getChangeFn(ui, qp)

                fn?.([])
                expect(qp.show).toHaveBeenCalled()
                expect(qp.hide).not.toHaveBeenCalled()
                expect(qp.dispose).toHaveBeenCalled()

                fn?.([{ label: 'foo' }])
                expect(qp.hide).toHaveBeenCalled()
                expect(historyObj.moveItemToTop).toHaveBeenCalled()

                fn?.([{ label: 'foo', description: 'bar' }])
                expect(qp.hide).toHaveBeenCalled()
                expect(historyObj.moveItemToTop).toHaveBeenCalled()

                const item = await task
                expect(item.text).toBe('foo')
                expect(item.pkgName).toBe('')
            } finally {
                historyObj.items = []
            }
        })
    })

    it('moveHistoryNodeToTop', () => {
        const ui = new UI(createState())

        ui.moveHistoryNodeToTop(new replHistory.HistoryNode({}))
        expect(historyObj.moveToTop).toHaveBeenCalled()
    })

    it('removeHistoryNode', () => {
        const ui = new UI(createState())

        ui.removeHistoryNode(new replHistory.HistoryNode({}))
        expect(historyObj.removeNode).toHaveBeenCalled()
    })

    it('getHistoryItems', () => {
        const ui = new UI(createState())

        const items = ui.getHistoryItems()
        expect(items).toMatchObject([])
    })

    const initTreeTest = (name: string, initFn: (ui: UI) => void, obj: { update: jest.Mock }) => {
        const ui = new UI(createState())

        initFn(ui)

        expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalledWith(name, expect.anything())
        expect(obj.update).toHaveBeenCalled()
    }

    it('initThreadsTree', () => {
        initTreeTest('lispThreads', (ui) => ui.initThreadsTree([]), threadsObj)
    })

    it('initAsdfSystemsTree', () => {
        initTreeTest('asdfSystems', (ui) => ui.initAsdfSystemsTree([]), asdfObj)
    })

    it('initHistoryTree', () => {
        initTreeTest('replHistory', (ui) => ui.initHistoryTree([]), historyObj)
    })

    it('initPackagesTree', () => {
        initTreeTest('lispPackages', (ui) => ui.initPackagesTree([]), packagesObj)
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
        updateTreeTest((ui) => ui.updatePackages([]), packagesObj)
    })

    it('updateAsdfSystems', () => {
        updateTreeTest((ui) => ui.updateAsdfSystems([]), asdfObj)
    })

    it('updateThreads', () => {
        updateTreeTest((ui) => ui.updateThreads([]), threadsObj)
    })

    it('getUserInput', async () => {
        const ui = new UI(createState())
        let onName: string | undefined = undefined

        const callFn = async () => {
            replMock.replOn.mockImplementationOnce((name: string, fn: (text: string) => void) => {
                onName = name
                fn('foo')
            })

            return await ui.getUserInput()
        }

        const text = await callFn()

        expect(onName).toBe('userInput')
        expect(text).toBe('foo')
        expect(replMock.replGetUserInput).toHaveBeenCalled()
        expect(replMock.replOff).toHaveBeenCalledWith('userInput', expect.anything())
        expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
    })

    describe('getRestartIndex', () => {
        it('restart index', async () => {
            const ui = new UI(createState())
            const info = { message: 'foo', restarts: [], stackTrace: [] }
            let task: Promise<number | undefined> | undefined = undefined
            const fns = getAllCallbacks(debugObj, 3, () => (task = ui.getRestartIndex(info)))

            fns['jump-to']('bar', 5, 10)
            fns['restart'](5)
            fns['debugClosed']()

            const index = await task

            expect(index).toBe(5)
            expect(vscodeMock.workspace.openTextDocument).toHaveBeenCalledWith('bar')
            expect(vscodeMock.window.showTextDocument).toHaveBeenCalled()
            expect(debugObj.run).toHaveBeenCalled()
            expect(debugObj.stop).toHaveBeenCalled()
        })

        const closedTest = async (restarts: RestartInfo[], expectIndex: number | undefined) => {
            const ui = new UI(createState())
            const info = {
                message: 'foo',
                restarts,
                stackTrace: [],
            }
            let task: Promise<number | undefined> | undefined = undefined
            const fns = getAllCallbacks(debugObj, 3, () => (task = ui.getRestartIndex(info)))

            fns['debugClosed']()

            const index = await task

            expect(index).toBe(expectIndex)
            expect(debugObj.run).toHaveBeenCalled()
            expect(debugObj.stop).toHaveBeenCalled()
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
        expect(historyObj.clear).toHaveBeenCalled()
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
})
