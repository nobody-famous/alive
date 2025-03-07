import { getAllCallbacks } from '../../../../TestHelpers'
import { DebugInfo, InspectInfo } from '../../Types'
import { COMMON_LISP_ID } from '../../Utils'
import { LSP } from '../LSP'

const nodeMock = jest.requireMock('vscode-languageclient/node')
jest.mock('vscode-languageclient/node')

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const netMock = jest.requireMock('net')
jest.mock('net')

describe('LSP tests', () => {
    const createClientMock = () => ({
        start: jest.fn(),
        onReady: jest.fn(),
        onNotification: jest.fn(),
        onRequest: jest.fn(),
        sendRequest: jest.fn(),
    })

    const doConnect = async (mockFns?: Record<string, jest.Mock>) => {
        const clientMock: Record<string, jest.Mock> = createClientMock()
        nodeMock.LanguageClient.mockImplementationOnce(() => clientMock)

        for (const name in mockFns) {
            clientMock[name] = mockFns[name]
        }

        const lsp = new LSP({ hoverText: '' })
        await lsp.connect({ host: 'foo', port: 1234 })

        return { lsp, clientMock }
    }

    const networkErrorTest = async (
        fn: (lsp: LSP) => Promise<unknown>,
        validate: (resp: unknown) => void,
        throwObj: boolean = true
    ) => {
        const { lsp } = await doConnect({
            sendRequest: jest.fn(() => {
                const msg = 'Failed, as requested'
                throw throwObj ? new Error(msg) : msg
            }),
        })

        const resp = await fn(lsp)

        validate(resp)
    }

    describe('connect', () => {
        it('Success', async () => {
            const { clientMock } = await doConnect()

            expect(clientMock.start).toHaveBeenCalled()
            expect(clientMock.onRequest).toHaveBeenCalled()
        })

        it('Failed', async () => {
            await expect(async () => {
                await doConnect({
                    onReady: jest.fn().mockImplementation(() => {
                        throw new Error('Failed, as requested')
                    }),
                })
            }).rejects.toThrow()
        })
    })

    describe('connect callbacks', () => {
        const getClientFuncs = async () => {
            const lsp = new LSP({ hoverText: '' })
            const fakeClient = {
                onNotification: jest.fn(),
                onReady: jest.fn(),
                onRequest: jest.fn(),
                start: jest.fn(),
            }
            const fakeHostPort = { host: 'foo', port: 1234 }

            nodeMock.LanguageClient.mockImplementationOnce(() => fakeClient)
            nodeMock.LanguageClient.mockImplementationOnce(() => fakeClient)

            lsp.emit = jest.fn()

            const funcMap = {
                notification: await getAllCallbacks(fakeClient.onNotification, () => lsp.connect(fakeHostPort)),
                request: await getAllCallbacks(fakeClient.onRequest, async () => lsp.connect(fakeHostPort)),
            }

            return { lsp, funcMap }
        }

        const testStream = async (name: string) => {
            const { lsp, funcMap } = await getClientFuncs()

            funcMap.notification[name]?.({})
            expect(lsp.emit).not.toHaveBeenCalled()

            funcMap.notification[name]?.({ data: 5 })
            expect(lsp.emit).not.toHaveBeenCalled()

            funcMap.notification[name]?.({ data: 'foo' })
            expect(lsp.emit).toHaveBeenCalledWith('output', 'foo')
        }

        it('streams', async () => {
            await testStream('$/alive/stderr')
            await testStream('$/alive/stdout')
        })

        it('refresh', async () => {
            const { lsp, funcMap } = await getClientFuncs()

            funcMap.notification['$/alive/refresh']?.()
            expect(lsp.emit).toHaveBeenCalledTimes(5)
        })

        it('query-io', async () => {
            const { lsp, funcMap } = await getClientFuncs()

            funcMap.notification['$/alive/query-io']?.()
            expect(lsp.emit).not.toHaveBeenCalled()

            funcMap.notification['$/alive/query-io']?.({ data: 'foo' })
            expect(lsp.emit).toHaveBeenCalledWith('queryText', expect.anything())
        })

        it('userInput', async () => {
            const { lsp, funcMap } = await getClientFuncs()

            lsp.emit = jest.fn().mockImplementation((name: string, fn: (input: string) => void) => {
                fn('Some input')
            })

            const resp = await funcMap.request['$/alive/userInput']?.()

            expect(resp).toMatchObject({ text: 'Some input' })
        })

        describe('debugger', () => {
            it('success', async () => {
                const { lsp, funcMap } = await getClientFuncs()

                lsp.emit = jest.fn().mockImplementation((name: string, info: DebugInfo, fn: (index: number) => void) => {
                    fn(5)
                })

                expect(await funcMap.request['$/alive/debugger']({ message: 'foo', restarts: [], stackTrace: [] })).toMatchObject(
                    { index: 5 }
                )
            })

            it('Missing data', async () => {
                const { lsp, funcMap } = await getClientFuncs()

                lsp.emit = jest.fn().mockImplementation((name: string, info: DebugInfo, fn: (index: number) => void) => {
                    fn(5)
                })

                expect(
                    await funcMap.request['$/alive/debugger']({ message: 'foo', restarts: [5], stackTrace: [10] })
                ).toMatchObject({ index: 5 })
            })

            it('debug info not object', async () => {
                const { funcMap } = await getClientFuncs()

                expect(await funcMap.request['$/alive/debugger']()).toBeUndefined()
            })
        })
    })

    describe('getHoverText', () => {
        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            expect(await lsp.getHoverText('/some/file', new vscodeMock.Position())).toBe('')
        })

        it('Invalid response', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => 'foo'),
            })

            expect(await lsp.getHoverText('/some/file', new vscodeMock.Position())).toBe('')
        })

        it('Valid response', async () => {
            const { lsp, clientMock } = await doConnect({
                sendRequest: jest.fn(() => ({
                    value: 'foo',
                })),
            })

            expect(await lsp.getHoverText('/some/file', new vscodeMock.Position())).toBe('foo')
            expect(clientMock.sendRequest).toHaveBeenCalledWith('textDocument/hover', expect.anything())
        })

        it('Request fail', async () => {
            await networkErrorTest(
                (lsp) => lsp.getHoverText('/some/file', new vscodeMock.Position()),
                (resp) => expect(resp).toBe('')
            )
            await networkErrorTest(
                (lsp) => lsp.getHoverText('/some/file', new vscodeMock.Position()),
                (resp) => expect(resp).toBe(''),
                false
            )
        })
    })

    describe('getSymbol', () => {
        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            expect(await lsp.getSymbol('/some/file', new vscodeMock.Position())).toBeUndefined()
        })

        it('Valid response', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({
                    value: ['foo', 'bar'],
                })),
            })

            expect(await lsp.getSymbol('/some/file', new vscodeMock.Position())).toMatchObject({ name: 'foo', package: 'bar' })
        })

        it('Invalid response', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({
                    value: ['foo'],
                })),
            })

            expect(await lsp.getSymbol('/some/file', new vscodeMock.Position())).toBeUndefined()
        })

        it('Request fail', async () => {
            await networkErrorTest(
                (lsp) => lsp.getSymbol('/some/file', new vscodeMock.Position()),
                (resp) => expect(resp).toBeUndefined()
            )
        })
    })

    describe('getExprRange', () => {
        const fakeSelection = { active: new vscodeMock.Position() }

        it('getSurroundingExprRange', async () => {
            const { lsp, clientMock } = await doConnect()

            await lsp.getSurroundingExprRange('foo', fakeSelection)

            expect(clientMock.sendRequest).toHaveBeenCalledWith('$/alive/surroundingFormBounds', expect.anything())
        })

        it('getTopExprRange', async () => {
            const { lsp, clientMock } = await doConnect()

            await lsp.getTopExprRange('foo', fakeSelection)

            expect(clientMock.sendRequest).toHaveBeenCalledWith('$/alive/topFormBounds', expect.anything())
        })

        it('Valid response', async () => {
            const fakePos = { line: 1, character: 5 }

            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ start: fakePos, end: fakePos })),
            })

            expect(await lsp.getExprRange('bar', 'foo', fakeSelection)).not.toBeUndefined()
        })

        it('Invalid response, parse pos fail', async () => {
            const fakePos = { line: 1, character: 5 }

            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ start: fakePos, end: 'Not valid' })),
            })

            expect(await lsp.getExprRange('bar', 'foo', fakeSelection)).toBeUndefined()
        })

        it('Invalid response', async () => {
            const { lsp } = await doConnect({ sendRequest: jest.fn(() => []) })

            expect(await lsp.getExprRange('bar', 'foo', fakeSelection)).toBeUndefined()
        })

        it('Request failed', async () => {
            await networkErrorTest(
                (lsp) => lsp.getExprRange('bar', 'foo', fakeSelection),
                (resp) => expect(resp).toBeUndefined()
            )
            await networkErrorTest(
                (lsp) => lsp.getExprRange('bar', 'foo', fakeSelection),
                (resp) => expect(resp).toBeUndefined(),
                false
            )
        })

        it('Not connected', async () => {
            const lsp = new LSP({ hoverText: '' })

            expect(await lsp.getExprRange('bar', 'foo', fakeSelection)).toBeUndefined()
        })
    })

    const runRemoveTest = async (fn: (lsp: LSP) => Promise<void>, expCalled: boolean, fns?: Record<string, jest.Mock>) => {
        const { lsp } = await doConnect(fns)
        let eventCalled = false

        lsp.on('refreshPackages', () => {
            eventCalled = true
        })

        await fn(lsp)

        expect(eventCalled).toBe(expCalled)
    }

    const runNoClientTest = async (fn: (lsp: LSP) => Promise<void>) => {
        const lsp = new LSP({ hoverText: '' })
        let eventCalled = false

        lsp.on('refreshPackages', () => {
            eventCalled = true
        })

        await fn(lsp)

        expect(eventCalled).toBe(false)
    }

    describe('removeExport', () => {
        it('Success', async () => {
            await runRemoveTest(async (lsp) => await lsp.removeExport('foo', 'bar'), true)
        })

        it('Fail', async () => {
            await runRemoveTest(async (lsp) => await lsp.removeExport('foo', 'bar'), false, {
                sendRequest: jest.fn(() => {
                    throw new Error('Failed, as requested')
                }),
            })
        })

        it('No client', async () => {
            await runNoClientTest(async (lsp) => await lsp.removeExport('foo', 'bar'))
        })
    })

    describe('removePackage', () => {
        it('Success', async () => {
            await runRemoveTest(async (lsp) => await lsp.removePackage('foo'), true)
        })

        it('Fail', async () => {
            await runRemoveTest(async (lsp) => await lsp.removePackage('foo'), false, {
                sendRequest: jest.fn(() => {
                    throw new Error('Failed, as requested')
                }),
            })
        })

        it('No client', async () => {
            await runNoClientTest(async (lsp) => await lsp.removePackage('foo'))
        })
    })

    describe('getPackage', () => {
        const runTest = async (testPkg: unknown, validate: (pkg: string | undefined) => void) => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => testPkg),
            })

            const pkg = await lsp.getPackage('uri', new vscodeMock.Position())

            validate(pkg)
        }

        it('Success', async () => {
            await runTest({ package: 'foo' }, (pkg) => expect(pkg).toBe('foo'))
        })

        it('Invalid package', async () => {
            await runTest({}, (pkg) => expect(pkg).toBeUndefined())
            await runTest({}, (pkg) => expect(pkg).toBeUndefined())
        })

        it('Fail', async () => {
            await networkErrorTest(
                (lsp) => lsp.getPackage('uri', new vscodeMock.Position()),
                (resp) => expect(resp).toBeUndefined()
            )
            await networkErrorTest(
                (lsp) => lsp.getPackage('uri', new vscodeMock.Position()),
                (resp) => expect(resp).toBeUndefined(),
                false
            )
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })
            const pkg = await lsp.getPackage('uri', new vscodeMock.Position())

            expect(pkg).toBeUndefined()
        })
    })

    describe('getMacroInfo', () => {
        it('Success, selection not empty', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ package: 'Some package' })),
            })

            const info = await lsp.getSurroundingInfo(() => 'Some text', 'uri', {
                active: new vscodeMock.Position(),
                start: new vscodeMock.Position(),
                end: new vscodeMock.Position(),
                isEmpty: false,
            })

            expect(info?.text).toBe('Some text')
            expect(info?.package).toBe('Some package')
        })

        it('Success, selection empty', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn((method: string) => {
                    return method === '$/alive/surroundingFormBounds'
                        ? {
                              start: { line: 5, character: 10 },
                              end: { line: 5, character: 15 },
                          }
                        : { package: 'Some package' }
                }),
            })

            const info = await lsp.getSurroundingInfo(() => 'Some text', 'uri', {
                active: new vscodeMock.Position(),
                start: new vscodeMock.Position(),
                end: new vscodeMock.Position(),
                isEmpty: true,
            })

            expect(info?.text).toBe('Some text')
            expect(info?.package).toBe('Some package')
        })

        it('No range', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ package: 'Some package' })),
            })

            const info = await lsp.getSurroundingInfo(() => 'Some text', 'uri', {
                active: new vscodeMock.Position(),
                start: new vscodeMock.Position(),
                end: new vscodeMock.Position(),
                isEmpty: true,
            })

            expect(info).toBeUndefined()
        })

        it('Invalid package', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ package: 5 })),
            })

            const info = await lsp.getSurroundingInfo(() => 'Some text', 'uri', {
                active: new vscodeMock.Position(),
                start: new vscodeMock.Position(),
                end: new vscodeMock.Position(),
                isEmpty: false,
            })

            expect(info).toBeUndefined()
        })
    })

    describe('macroexpand', () => {
        const runTest = async (
            fn: (lsp: LSP) => Promise<string | undefined>,
            fakeResp: unknown,
            validate: (macro: string | undefined) => void
        ) => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => fakeResp),
            })

            const macro = await fn(lsp)

            validate(macro)
        }

        it('Success', async () => {
            await runTest(
                (lsp) => lsp.macroexpand('Some text', 'Some package'),
                { text: 'Some text' },
                (macro) => expect(macro).not.toBeUndefined()
            )

            await runTest(
                (lsp) => lsp.macroexpand1('Some text', 'Some package'),
                { text: 'Some text' },
                (macro) => expect(macro).not.toBeUndefined()
            )
        })

        it('Invalid response', async () => {
            await runTest(
                (lsp) => lsp.macroexpand('Some text', 'Some package'),
                { text: 10 },
                (macro) => expect(macro).toBeUndefined()
            )
        })

        it('Not connected', async () => {
            const lsp = new LSP({ hoverText: '' })

            expect(await lsp.macroexpand('Some text', 'Some package')).toBeUndefined()
        })

        it('Failure', async () => {
            await networkErrorTest(
                (lsp) => lsp.macroexpand('Some text', 'Some package'),
                (resp) => expect(resp).toBeUndefined()
            )
            await networkErrorTest(
                (lsp) => lsp.macroexpand('Some text', 'Some package'),
                (resp) => expect(resp).toBeUndefined(),
                false
            )
        })
    })

    describe('getEvalInfo', () => {
        const createSelection = (params?: unknown) => {
            return Object.assign(
                {},
                {
                    active: new vscodeMock.Position(),
                    start: new vscodeMock.Position(),
                    end: new vscodeMock.Position(),
                    isEmpty: false,
                },
                params
            )
        }

        it('Success', async () => {
            const fakeSelection = createSelection()
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ package: 'Some package' })),
            })

            const info = await lsp.getEvalInfo(() => 'Some text', 'uri', fakeSelection)

            expect(info?.text).toBe('Some text')
            expect(info?.package).toBe('Some package')
        })

        it('No range', async () => {
            const fakeSelection = createSelection({ isEmpty: true })

            const { lsp } = await doConnect()

            expect(await lsp.getEvalInfo(() => 'Some text', 'uri', fakeSelection)).toBeUndefined()
        })
    })

    describe('isConnected', () => {
        it('True', async () => {
            const { lsp } = await doConnect()

            expect(lsp.isConnected()).toBe(true)
        })

        it('False', () => {
            const lsp = new LSP({ hoverText: '' })

            expect(lsp.isConnected()).toBe(false)
        })
    })

    describe('tryCompileFile', () => {
        it('Success', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({
                    messages: [
                        {
                            message: 'msg1',
                            severity: 'sev1',
                            location: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
                        },
                        {
                            message: 'msg2',
                            severity: 'sev2',
                            location: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
                        },
                        {
                            message: 'msg3',
                            severity: 'sev3',
                            location: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
                        },
                    ],
                })),
            })

            const resp = await lsp.tryCompileFile('/some/path')

            expect(resp).toMatchObject({ notes: [{ message: 'msg1' }, { message: 'msg2' }, { message: 'msg3' }] })
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            const resp = await lsp.tryCompileFile('/some/path')

            expect(resp).toMatchObject({ notes: [] })
        })

        it('Failure', async () => {
            await networkErrorTest(
                (lsp) => lsp.tryCompileFile('/some/path'),
                (resp) => expect(resp).toMatchObject({ notes: [] })
            )
            await networkErrorTest(
                (lsp) => lsp.tryCompileFile('/some/path'),
                (resp) => expect(resp).toMatchObject({ notes: [] }),
                false
            )
        })
    })

    describe('compileFile', () => {
        it('Success', async () => {
            const { lsp } = await doConnect()

            const resp = await lsp.compileFile('/some/path')
            expect(resp).toMatchObject({ notes: [] })
        })
    })

    it('editorChanged', () => {
        const runTest = (langId: string, validate: (lsp: LSP) => void) => {
            const lsp = new LSP({ hoverText: '' })

            lsp.emit = jest.fn()
            lsp.editorChanged({ languageId: langId })

            validate(lsp)
        }

        runTest(COMMON_LISP_ID, (lsp) => expect(lsp.emit).toHaveBeenCalledWith('startCompileTimer'))
        runTest('foo', (lsp) => expect(lsp.emit).not.toHaveBeenCalled())
    })

    it('textDocumentChanged', () => {
        const runTest = (langId: string, validate: (lsp: LSP) => void) => {
            const lsp = new LSP({ hoverText: '' })

            lsp.emit = jest.fn()
            lsp.textDocumentChanged({ languageId: langId })

            validate(lsp)
        }

        runTest(COMMON_LISP_ID, (lsp) => expect(lsp.emit).toHaveBeenCalledWith('startCompileTimer'))
        runTest('foo', (lsp) => expect(lsp.emit).not.toHaveBeenCalled())
    })

    describe('loadFile', () => {
        it('Success, no messages', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ messages: [] })),
            })

            await lsp.loadFile('/some/path')
        })

        it('Success, with messages', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({
                    messages: [{ severity: 'TOP', message: 'foo' }, { message: 'foo' }, { severity: 'TOP' }],
                })),
            })

            lsp.emit = jest.fn()
            await lsp.loadFile('/some/path')

            expect(lsp.emit).toHaveBeenCalledTimes(1)
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            lsp.emit = jest.fn()
            await lsp.loadFile('/some/path')

            expect(lsp.emit).not.toHaveBeenCalled()
        })

        it('Failure, as error', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => {
                    throw new Error('Failed, as requested')
                }),
            })

            lsp.emit = jest.fn()
            await lsp.loadFile('/some/path')

            expect(lsp.emit).toHaveBeenCalledTimes(1)
        })

        it('Failure, as not error', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => {
                    throw 'Failed, as requested'
                }),
            })

            lsp.emit = jest.fn()
            await lsp.loadFile('/some/path')

            expect(lsp.emit).toHaveBeenCalledTimes(1)
        })
    })

    describe('loadAsdfSystem', () => {
        it('Success', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => 'Some response'),
            })

            const resp = await lsp.loadAsdfSystem('Some system')
            expect(resp).toBe('Some response')
        })

        it('Failure', async () => {
            await networkErrorTest(
                (lsp) => lsp.loadAsdfSystem('Some system'),
                (resp) => expect(resp).toBeUndefined()
            )
            await networkErrorTest(
                (lsp) => lsp.loadAsdfSystem('Some system'),
                (resp) => expect(resp).toBeUndefined(),
                false
            )
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            expect(await lsp.loadAsdfSystem('Some system')).toBeUndefined()
        })
    })

    describe('List items tests', () => {
        const noClientTest = async <T>(fn: (lsp: LSP) => Promise<T>) => {
            const lsp = new LSP({ hoverText: '' })

            expect(await fn(lsp)).toMatchObject([])
        }

        const listTest = async <T>(respData: unknown, fn: (lsp: LSP) => Promise<T[]>, validate: (result: T[]) => void) => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => respData),
            })

            validate(await fn(lsp))
        }

        describe('listThreads', () => {
            it('Success', async () => {
                await listTest(
                    {
                        threads: [
                            { id: '5', name: 'foo' },
                            { id: {}, name: {} },
                            { id: '10', name: 'bar' },
                        ],
                    },
                    (lsp) => lsp.listThreads(),
                    (result) => expect(result.length).toBe(2)
                )
            })

            it('Invalid data', async () => {
                await listTest(
                    [{ id: 5, name: 'foo' }],
                    (lsp) => lsp.listThreads(),
                    (result) => expect(result.length).toBe(0)
                )
            })

            it('No client', async () => {
                await noClientTest((lsp) => lsp.listThreads())
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.listThreads(),
                    (resp) => expect(resp).toMatchObject([])
                )
                await networkErrorTest(
                    (lsp) => lsp.listThreads(),
                    (resp) => expect(resp).toMatchObject([]),
                    false
                )
            })
        })

        describe('listPackages', () => {
            it('Success', async () => {
                await listTest(
                    {
                        packages: [
                            { name: 'foo', exports: null, nicknames: ['a', 'b'] },
                            { name: {}, exports: [], nicknames: [] },
                            { name: 'bar', exports: ['a', 'b'], nicknames: null },
                        ],
                    },
                    (lsp) => lsp.listPackages(),
                    (result) => {
                        expect(result.length).toBe(2)
                        expect(result[0].exports).toMatchObject([])
                        expect(result[1].nicknames).toMatchObject([])
                    }
                )
            })

            it('Invalid data', async () => {
                await listTest(
                    [{ id: 5, name: 'foo' }],
                    (lsp) => lsp.listPackages(),
                    (result) => expect(result.length).toBe(0)
                )
            })

            it('No client', async () => {
                await noClientTest((lsp) => lsp.listPackages())
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.listPackages(),
                    (resp) => expect(resp).toMatchObject([])
                )
                await networkErrorTest(
                    (lsp) => lsp.listPackages(),
                    (resp) => expect(resp).toMatchObject([]),
                    false
                )
            })
        })

        describe('listAsdfSystems', () => {
            it('Success', async () => {
                await listTest(
                    {
                        systems: ['foo', {}, 'bar'],
                    },
                    (lsp) => lsp.listAsdfSystems(),
                    (result) => expect(result.length).toBe(2)
                )
            })

            it('Invalid data', async () => {
                await listTest(
                    [{ id: 5, name: 'foo' }],
                    (lsp) => lsp.listAsdfSystems(),
                    (result) => expect(result.length).toBe(0)
                )
            })

            it('No client', async () => {
                await noClientTest((lsp) => lsp.listAsdfSystems())
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.listAsdfSystems(),
                    (resp) => expect(resp).toMatchObject([])
                )
                await networkErrorTest(
                    (lsp) => lsp.listAsdfSystems(),
                    (resp) => expect(resp).toMatchObject([]),
                    false
                )
            })
        })
    })

    describe('killThread', () => {
        it('Success', async () => {
            let reqMethod: string = ''
            const { lsp } = await doConnect({
                sendRequest: jest.fn((method: string) => {
                    reqMethod = method
                }),
            })

            await lsp.killThread({ id: '10', name: 'foo' })
            expect(reqMethod).toBe('$/alive/killThread')
        })

        it('Failure', async () => {
            await networkErrorTest(
                (lsp) => lsp.killThread({ id: '10', name: 'foo' }),
                (resp) => expect(resp).toBeUndefined()
            )
            await networkErrorTest(
                (lsp) => lsp.killThread({ id: '10', name: 'foo' }),
                (resp) => expect(resp).toBeUndefined(),
                false
            )
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            await lsp.killThread({ id: '10', name: 'foo' })
        })
    })

    describe('eval', () => {
        it('Success, single string', async () => {
            const { lsp } = await doConnect({ sendRequest: jest.fn(() => ({ text: 'Result text' })) })

            lsp.emit = jest.fn()
            await lsp.evalWithOutput('Some text', 'Some package')

            expect(lsp.emit).toHaveBeenCalledTimes(2)
        })

        it('Success, array of strings', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ text: ['First text', 'Second text', 'Third text'] })),
            })

            lsp.emit = jest.fn()
            await lsp.evalWithOutput('Some text', 'Some package')

            expect(lsp.emit).toHaveBeenCalledTimes(4)
        })

        it('Failure', async () => {
            await networkErrorTest(
                (lsp) => lsp.evalWithOutput('Some text', 'Some package'),
                (resp) => expect(resp).toBeUndefined()
            )
            await networkErrorTest(
                (lsp) => lsp.evalWithOutput('Some text', 'Some package'),
                (resp) => expect(resp).toBeUndefined(),
                false
            )
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            lsp.emit = jest.fn()
            await lsp.evalWithOutput('Some text', 'Some package')

            expect(lsp.emit).toHaveBeenCalledTimes(1)
        })
    })

    describe('inspect', () => {
        const fakeInfo = {
            id: 5,
            resultType: 'foo',
            text: 'Some text',
            package: 'Some package',
            result: [],
        }

        describe('doInspect', () => {
            const successTest = async (fn: (lsp: LSP) => Promise<void>) => {
                const { lsp } = await doConnect({ sendRequest: jest.fn(() => fakeInfo) })

                lsp.emit = jest.fn()
                await fn(lsp)

                expect(lsp.emit).toHaveBeenCalled()
            }

            it('Success', async () => {
                await successTest((lsp) => lsp.inspect('Some text', 'Some package'))
                await successTest((lsp) => lsp.inspectMacro('Some text', 'Some package'))
                await successTest((lsp) => lsp.inspectSymbol({ name: 'foo', package: 'bar' }))
            })

            it('Not connected', async () => {
                const lsp = new LSP({ hoverText: '' })

                lsp.emit = jest.fn()
                await lsp.inspect('Some text', 'Some package')

                expect(lsp.emit).not.toHaveBeenCalled()
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.inspect('Some text', 'Some package'),
                    (resp) => expect(resp).toBeUndefined()
                )
            })
        })

        describe('doInspectMacro', () => {
            const successTest = async (fn: (lsp: LSP, info: InspectInfo) => Promise<void>) => {
                const info = { id: 5, resultType: 'test', text: 'Some text', package: 'Some package', result: {} }
                const { lsp } = await doConnect({ sendRequest: jest.fn(() => ({ text: 'Result text' })) })

                lsp.emit = jest.fn()
                await fn(lsp, info)

                expect(lsp.emit).toHaveBeenCalledWith('inspectUpdate', Object.assign({}, info, { result: 'Result text' }))
            }

            it('Success', async () => {
                await successTest((lsp: LSP, info) => lsp.inspectMacroInc(info))
                await successTest((lsp: LSP, info) => lsp.inspectRefreshMacro(info))
            })

            it('Invalid response', async () => {
                const runTest = async (result: unknown, resp: unknown) => {
                    const { lsp } = await doConnect({ sendRequest: jest.fn(() => resp) })

                    lsp.emit = jest.fn()
                    await lsp.inspectMacroInc({ id: 5, resultType: 'macro', text: 'Some text', package: 'Some package', result })

                    expect(lsp.emit).not.toHaveBeenCalled()
                }

                await runTest('result', undefined)
                await runTest('result', { test: 10 })
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) =>
                        lsp.inspectMacroInc({
                            id: 5,
                            resultType: 'macro',
                            text: 'Some text',
                            package: 'Some package',
                            result: [],
                        }),
                    (resp) => expect(resp).toBeUndefined()
                )
            })
        })

        describe('inspectRefresh', () => {
            it('Success', async () => {
                const { lsp } = await doConnect({
                    sendRequest: jest.fn(() => ({ id: '5', result: {}, resultType: 'bar' })),
                })

                lsp.emit = jest.fn()
                await lsp.inspectRefresh(fakeInfo)

                expect(lsp.emit).toHaveBeenCalledWith('inspectUpdate', expect.anything())
            })

            it('Success, inspect macro', async () => {
                const { lsp } = await doConnect({ sendRequest: jest.fn(() => ({ text: 'Some text' })) })

                lsp.emit = jest.fn()
                await lsp.inspectRefresh({ ...fakeInfo, resultType: 'macro' })

                expect(lsp.emit).toHaveBeenCalledWith('inspectUpdate', expect.anything())
            })

            it('Invalid response', async () => {
                const { lsp } = await doConnect({ sendRequest: jest.fn(() => 10) })

                lsp.emit = jest.fn()
                await lsp.inspectRefresh(fakeInfo)

                expect(lsp.emit).not.toHaveBeenCalled()
            })

            it('Not connected', async () => {
                const lsp = new LSP({ hoverText: '' })

                lsp.emit = jest.fn()
                await lsp.inspectRefresh(fakeInfo)

                expect(lsp.emit).not.toHaveBeenCalled()
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.inspectRefresh(fakeInfo),
                    (resp) => expect(resp).toBeUndefined()
                )
            })
        })

        describe('inspectEval', () => {
            it('Success', async () => {
                const { lsp } = await doConnect({
                    sendRequest: jest.fn(() => ({
                        id: '10',
                        result: {},
                        resultType: 'foo',
                    })),
                })

                lsp.emit = jest.fn()
                await lsp.inspectEval(fakeInfo, 'Some eval text')

                expect(lsp.emit).toHaveBeenCalledTimes(1)
            })

            it('Success, invalid response', async () => {
                const sendReq = jest.fn()
                const { lsp } = await doConnect({ sendRequest: sendReq })

                sendReq.mockReturnValueOnce({ id: 10 })
                sendReq.mockReturnValueOnce(fakeInfo)
                lsp.emit = jest.fn()

                await lsp.inspectEval(fakeInfo, 'Some eval text')

                expect(lsp.emit).toHaveBeenCalledTimes(1)
            })

            it('Not connected', async () => {
                const lsp = new LSP({ hoverText: '' })

                lsp.emit = jest.fn()
                await lsp.inspectEval(fakeInfo, 'Some text')

                expect(lsp.emit).not.toHaveBeenCalled()
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.inspectEval(fakeInfo, 'Some eval text'),
                    (resp) => expect(resp).toBeUndefined()
                )
            })
        })

        describe('inspectClosed', () => {
            it('Success', async () => {
                const { lsp } = await doConnect()

                lsp.emit = jest.fn()
                await lsp.inspectClosed(fakeInfo)

                expect(lsp.emit).not.toHaveBeenCalled()
            })

            it('Not connected', async () => {
                const lsp = new LSP({ hoverText: '' })

                lsp.emit = jest.fn()
                await lsp.inspectClosed(fakeInfo)

                expect(lsp.emit).not.toHaveBeenCalled()
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.inspectClosed(fakeInfo),
                    (resp) => expect(resp).toBeUndefined()
                )
            })
        })
    })

    describe('handleError', () => {
        const fakeInfo = {
            id: 5,
            resultType: 'foo',
            text: 'Some text',
            package: 'Some package',
            result: [],
        }

        it('', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => {
                    throw { foo: 'bar' }
                }),
            })

            lsp.emit = jest.fn()
            await lsp.inspectClosed(fakeInfo)

            expect(lsp.emit).toHaveBeenCalledWith('output', expect.anything())
        })
    })

    it('Server opts', async () => {
        const getOptsFn = async () => {
            const lsp = new LSP({ hoverText: '' })
            const clientMock = createClientMock()
            const fns: Record<string, (() => Promise<void> | void) | undefined> = {}

            netMock.connect.mockImplementationOnce((info: unknown, cb: () => void) => {
                fns.socketCB = cb
                return {
                    on: jest.fn((label: string, fn: () => void) => {
                        fns.errorFn = fn
                    }),
                }
            })

            nodeMock.LanguageClient.mockImplementationOnce((id: string, name: string, fn: () => Promise<void>) => {
                fns.optsFn = fn
                return clientMock
            })

            const task = lsp.connect({ host: 'foo', port: 1234 })
            const optsTask = fns.optsFn?.()

            fns.socketCB?.()
            fns.errorFn?.()

            await optsTask
            await task

            return fns
        }

        await getOptsFn()
    })
})
