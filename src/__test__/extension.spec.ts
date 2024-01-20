import { getAllCallbacks } from '../../TestHelpers'
import { activate } from '../extension'
import { COMMON_LISP_ID } from '../vscode/Utils'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

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
            lsp: {},
        }))
    })

    it('Activate', async () => {
        await activate(ctx)

        expect(configMock.readAliveConfig).toHaveBeenCalled()
        expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('replHistory.focus')
        expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith('lispRepl.focus')
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
    })

    describe('setWorkspaceEventHandlers', () => {
        const getHandler = async (toMock: jest.Mock): Promise<(() => void) | undefined> => {
            let handler: (() => void) | undefined = undefined

            toMock.mockImplementation((fn) => (handler = fn))

            await activate(ctx)

            return handler
        }

        it('onDidOpenTextDocument', async () => {
            const fn = await getHandler(vscodeMock.workspace.onDidOpenTextDocument)

            fn?.()
        })
    })
})
