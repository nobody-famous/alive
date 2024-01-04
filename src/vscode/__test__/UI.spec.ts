import { HistoryItem } from '../Types'
import { UI, UIState } from '../UI'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: () => ({ appendLine: () => {} }),
        registerWebviewViewProvider: jest.fn(),
        registerTreeDataProvider: jest.fn(),
        showQuickPick: jest.fn(),
    },
    TreeItem: class {},
}))

const replObj = {
    on: jest.fn(),
    clear: jest.fn(),
    clearInput: jest.fn(),
    addText: jest.fn(),
    setPackage: jest.fn(),
    setInput: jest.fn(),
}
jest.mock('../views/LispRepl', () => ({
    LispRepl: jest.fn().mockImplementation(() => replObj),
}))

jest.mock('../views/ReplHistory', () => ({
    ReplHistoryTreeProvider: class {
        private items: unknown[]
        constructor(items: unknown[]) {
            this.items = items
        }
        removeItem = jest.fn()
        addItem = jest.fn()
        update = jest.fn((items) => (this.items = items))
    },
}))

jest.mock('../views/PackagesTree', () => ({
    PackagesTreeProvider: class {
        private pkgs: unknown[]
        constructor(pkgs: unknown[]) {
            this.pkgs = pkgs
        }
    },
}))

jest.mock('../views/AsdfSystemsTree', () => ({
    AsdfSystemsTreeProvider: class {
        private systems: unknown[]
        constructor(systems: unknown[]) {
            this.systems = systems
        }
    },
}))

jest.mock('../views/ThreadsTree', () => ({
    ThreadsTreeProvider: class {
        private threads: unknown[]
        constructor(threads: unknown[]) {
            this.threads = threads
        }
    },
}))

const createState = (): UIState => {
    const state: UIState = {
        ctx: { subscriptions: [], extensionPath: 'foo' },
        historyNdx: -1,
    }

    return state
}

describe('UI tests', () => {
    beforeEach(() => jest.clearAllMocks())

    it('clearRepl', () => {
        const state = createState()
        const ui = new UI(state)

        ui.clearRepl()
    })

    describe('initRepl', () => {
        const getReplFn = (ui: UI, name: string): ((...args: unknown[]) => void) | undefined => {
            let evalFn = undefined
            const onFn = (label: string, fn: (...args: unknown[]) => void) => {
                if (name === label) {
                    evalFn = fn
                }
            }

            for (let mockCount = 0; mockCount < 4; mockCount++) {
                replObj.on.mockImplementationOnce(onFn)
            }

            ui.initRepl()

            return evalFn
        }

        describe('eval', () => {
            it('No history', () => {
                const ui = new UI(createState())
                const evalFn = getReplFn(ui, 'eval')

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

        const runHistoryTest = (
            fnName: string,
            treeItems: HistoryItem[] | undefined,
            index: number,
            validate: (state: UIState) => void
        ) => {
            const state = createState()
            const ui = new UI(state)
            const fn = getReplFn(ui, fnName)

            state.historyNdx = index

            if (treeItems !== undefined) {
                ui.initHistoryTree(treeItems)
            }

            fn?.()
            validate(state)
        }

        describe('historyDown', () => {
            it('No tree', () => {
                runHistoryTest('historyDown', undefined, -1, (state: UIState) => {
                    expect(state.historyNdx).toBe(-1)
                })
            })

            it('Empty history', () => {
                runHistoryTest('historyDown', [], -1, (state: UIState) => {
                    expect(state.historyNdx).toBe(-1)
                    expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalled()
                    expect(replObj.clearInput).toHaveBeenCalled()
                })
            })

            it('One history', () => {
                runHistoryTest('historyDown', [{ pkgName: 'foo', text: 'bar' }], 0, (state: UIState) => {
                    expect(state.historyNdx).toBe(-1)
                    expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalled()
                    expect(replObj.setPackage).not.toHaveBeenCalled()
                    expect(replObj.setInput).not.toHaveBeenCalled()
                    expect(replObj.clearInput).toHaveBeenCalled()
                })
            })

            it('Multiple history', () => {
                runHistoryTest(
                    'historyDown',
                    [
                        { pkgName: 'foo', text: 'bar' },
                        { pkgName: 'foo1', text: 'bar1' },
                    ],
                    1,
                    (state: UIState) => {
                        expect(state.historyNdx).toBe(0)
                        expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalled()
                        expect(replObj.setPackage).toHaveBeenCalledWith('foo')
                        expect(replObj.setInput).toHaveBeenCalledWith('bar')
                        expect(replObj.clearInput).not.toHaveBeenCalled()
                    }
                )
            })
        })

        describe('historyUp', () => {
            it('No tree', () => {
                runHistoryTest('historyUp', undefined, -1, (state: UIState) => {
                    expect(state.historyNdx).toBe(-1)
                })
            })

            it('Empty history', () => {
                runHistoryTest('historyUp', [], -1, (state: UIState) => {
                    expect(state.historyNdx).toBe(-1)
                    expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalled()
                    expect(replObj.clearInput).toHaveBeenCalled()
                })
            })

            it('One history', () => {
                runHistoryTest('historyUp', [{ pkgName: 'foo', text: 'bar' }], 0, (state: UIState) => {
                    expect(state.historyNdx).toBe(0)
                    expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalled()
                    expect(replObj.setPackage).toHaveBeenCalledWith('foo')
                    expect(replObj.setInput).toHaveBeenCalledWith('bar')
                    expect(replObj.clearInput).not.toHaveBeenCalled()
                })

                runHistoryTest('historyUp', [{ pkgName: 'foo', text: 'bar' }], -1, (state: UIState) => {
                    expect(state.historyNdx).toBe(0)
                    expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalled()
                    expect(replObj.setPackage).toHaveBeenCalledWith('foo')
                    expect(replObj.setInput).toHaveBeenCalledWith('bar')
                    expect(replObj.clearInput).not.toHaveBeenCalled()
                })
            })

            it('Multiple history', () => {
                runHistoryTest(
                    'historyUp',
                    [
                        { pkgName: 'foo', text: 'bar' },
                        { pkgName: 'foo1', text: 'bar1' },
                    ],
                    0,
                    (state: UIState) => {
                        expect(state.historyNdx).toBe(1)
                        expect(vscodeMock.window.registerTreeDataProvider).toHaveBeenCalled()
                        expect(replObj.setPackage).toHaveBeenCalledWith('foo1')
                        expect(replObj.setInput).toHaveBeenCalledWith('bar1')
                        expect(replObj.clearInput).not.toHaveBeenCalled()
                    }
                )
            })
        })

        describe('requestPackage', () => {
            it('No packages', async () => {
                const state = createState()
                const ui = new UI(state)
                const fn = getReplFn(ui, 'requestPackage')

                ui.on('listPackages', async (fn) => fn([]))

                await fn?.()
                expect(vscodeMock.window.showQuickPick).toHaveBeenCalled()
                expect(replObj.setPackage).not.toHaveBeenCalled()
            })

            it('One package', async () => {
                const state = createState()
                const ui = new UI(state)
                const fn = getReplFn(ui, 'requestPackage')

                ui.on('listPackages', async (fn) => fn([{ name: 'foo', nicknames: [] }]))

                vscodeMock.window.showQuickPick.mockImplementationOnce((names: string[]) => names[0])

                await fn?.()

                expect(vscodeMock.window.showQuickPick).toHaveBeenCalledWith(['foo'], expect.anything())
                expect(replObj.setPackage).toHaveBeenCalledWith('foo')
            })
        })
    })

    it('addReplText', () => {
        const ui = new UI(createState())
        let text = ''

        replObj.addText.mockImplementationOnce((str: string) => (text = str))
        ui.addReplText('foo')

        expect(text).toBe('foo')
    })
})
