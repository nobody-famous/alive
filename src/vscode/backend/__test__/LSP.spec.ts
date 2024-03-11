import { getCallback } from '../../../../TestHelpers'
import { InspectInfo } from '../../Types'
import { LSP } from '../LSP'

const nodeMock = jest.requireMock('vscode-languageclient/node')
jest.mock('vscode-languageclient/node')

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const utilsMock = jest.requireMock('../../Utils')
jest.mock('../../Utils')

const guardsMock = jest.requireMock('../../Guards')
jest.mock('../../Guards')

describe('LSP tests', () => {
    const doConnect = async (mockFns?: Record<string, jest.Mock>) => {
        const clientMock: Record<string, jest.Mock> = {
            start: jest.fn(),
            onReady: jest.fn(),
            onNotification: jest.fn(),
            onRequest: jest.fn(),
            sendRequest: jest.fn(),
        }
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
        const getClientFunc = async (name: string) => {
            const lsp = new LSP({ hoverText: '' })
            const fakeClient = {
                onNotification: jest.fn(() => console.log('MOCK CALLED')),
                onReady: jest.fn(),
                onRequest: jest.fn(),
                start: jest.fn(),
            }

            nodeMock.LanguageClient.mockImplementationOnce(() => fakeClient)

            lsp.emit = jest.fn()
            const cb = await getCallback(fakeClient.onNotification, 3, () => lsp.connect({ host: 'foo', port: 1234 }), name)

            return { lsp, cb }
        }

        const testStream = async (name: string) => {
            const { lsp, cb } = await getClientFunc(name)

            guardsMock.isObject.mockImplementationOnce(() => false)
            cb?.({})
            expect(lsp.emit).not.toHaveBeenCalled()

            guardsMock.isString.mockImplementationOnce(() => false)
            cb?.({})
            expect(lsp.emit).not.toHaveBeenCalled()

            cb?.({ data: 'foo' })
            expect(lsp.emit).toHaveBeenCalledWith('output', 'foo')
        }

        it('streams', async () => {
            await testStream('$/alive/stderr')
            await testStream('$/alive/stdout')
        })

        it('refresh', async () => {
            const { lsp, cb } = await getClientFunc('$/alive/refresh')

            cb?.()
            expect(lsp.emit).toHaveBeenCalledTimes(5)
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

            guardsMock.isObject.mockImplementationOnce(() => false)
            expect(await lsp.getHoverText('/some/file', new vscodeMock.Position())).toBe('')
        })

        it('Valid response', async () => {
            utilsMock.strToMarkdown.mockImplementationOnce((v: string) => v)

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

            utilsMock.parsePos.mockImplementationOnce(() => fakePos)
            utilsMock.parsePos.mockImplementationOnce(() => fakePos)

            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ start: fakePos, end: fakePos })),
            })

            expect(await lsp.getExprRange('bar', 'foo', fakeSelection)).not.toBeUndefined()
        })

        it('Invalid response, parse pos fail', async () => {
            const fakePos = { line: 1, character: 5 }

            utilsMock.parsePos.mockImplementationOnce(() => fakePos)

            const { lsp } = await doConnect({
                sendRequest: jest.fn(() => ({ start: fakePos, end: 'Not valid' })),
            })

            expect(await lsp.getExprRange('bar', 'foo', fakeSelection)).toBeUndefined()
        })

        it('Invalid response', async () => {
            guardsMock.isObject.mockImplementationOnce(() => false)

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
            guardsMock.isObject.mockImplementationOnce(() => false)
            await runTest({}, (pkg) => expect(pkg).toBeUndefined())

            guardsMock.isString.mockImplementationOnce(() => false)
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

            const info = await lsp.getMacroInfo(() => 'Some text', 'uri', {
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
                              start: {},
                              end: {},
                          }
                        : { package: 'Some package' }
                }),
            })

            utilsMock.parsePos.mockImplementationOnce(() => 1)
            utilsMock.parsePos.mockImplementationOnce(() => 1)

            const info = await lsp.getMacroInfo(() => 'Some text', 'uri', {
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

            const info = await lsp.getMacroInfo(() => 'Some text', 'uri', {
                active: new vscodeMock.Position(),
                start: new vscodeMock.Position(),
                end: new vscodeMock.Position(),
                isEmpty: true,
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
            guardsMock.isString.mockImplementationOnce(() => false)
            await runTest(
                (lsp) => lsp.macroexpand('Some text', 'Some package'),
                { text: 10 },
                (macro) => expect(macro).toBeUndefined()
            )
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
                sendRequest: jest.fn(() => ({ messages: [1, 2, 3] })),
            })
            const toFakeNote = (path: string, item: unknown) => ({ message: item })

            utilsMock.parseNote.mockImplementationOnce(toFakeNote)
            utilsMock.parseNote.mockImplementationOnce(toFakeNote)
            utilsMock.parseNote.mockImplementationOnce(toFakeNote)

            const resp = await lsp.tryCompileFile('/some/path')

            expect(resp).toMatchObject({ notes: [{ message: 1 }, { message: 2 }, { message: 3 }] })
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            guardsMock.isObject.mockImplementationOnce(() => false)
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
        const runTest = (opts: { hasId: boolean; diags: boolean }, validate: (lsp: LSP) => void) => {
            const lsp = new LSP({ hoverText: '' })

            utilsMock.hasValidLangId.mockImplementationOnce(() => opts.hasId)
            utilsMock.diagnosticsEnabled.mockImplementationOnce(() => opts.diags)

            lsp.emit = jest.fn()
            lsp.editorChanged({ languageId: 'foo' })

            validate(lsp)
        }

        runTest({ hasId: true, diags: true }, (lsp) => expect(lsp.emit).toHaveBeenCalledWith('startCompileTimer'))
        runTest({ hasId: false, diags: true }, (lsp) => expect(lsp.emit).not.toHaveBeenCalled())
    })

    it('textDocumentChanged', () => {
        const runTest = (opts: { hasId: boolean; diags: boolean }, validate: (lsp: LSP) => void) => {
            const lsp = new LSP({ hoverText: '' })

            utilsMock.hasValidLangId.mockImplementationOnce(() => opts.hasId)
            utilsMock.diagnosticsEnabled.mockImplementationOnce(() => opts.diags)

            lsp.emit = jest.fn()
            lsp.textDocumentChanged({ languageId: 'foo' })

            validate(lsp)
        }

        runTest({ hasId: true, diags: true }, (lsp) => expect(lsp.emit).toHaveBeenCalledWith('startCompileTimer'))
        runTest({ hasId: false, diags: true }, (lsp) => expect(lsp.emit).not.toHaveBeenCalled())
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

            guardsMock.isObject.mockImplementationOnce(() => true)
            guardsMock.isObject.mockImplementationOnce(() => false)
            guardsMock.isString.mockImplementationOnce(() => false)

            lsp.emit = jest.fn()
            await lsp.loadFile('/some/path')

            expect(lsp.emit).toHaveBeenCalledTimes(1)
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            guardsMock.isObject.mockImplementationOnce(() => false)
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
                guardsMock.isThread.mockImplementationOnce(() => true)
                guardsMock.isThread.mockImplementationOnce(() => false)

                await listTest(
                    {
                        threads: [
                            { id: 5, name: 'foo' },
                            { id: 'foo', name: {} },
                            { id: 10, name: 'bar' },
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
                guardsMock.isPackage.mockImplementationOnce(() => true)
                guardsMock.isPackage.mockImplementationOnce(() => false)

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

            await lsp.killThread({ id: 10, name: 'foo' })
            expect(reqMethod).toBe('$/alive/killThread')
        })

        it('Failure', async () => {
            await networkErrorTest(
                (lsp) => lsp.killThread({ id: 10, name: 'foo' }),
                (resp) => expect(resp).toBeUndefined()
            )
            await networkErrorTest(
                (lsp) => lsp.killThread({ id: 10, name: 'foo' }),
                (resp) => expect(resp).toBeUndefined(),
                false
            )
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            await lsp.killThread({ id: 10, name: 'foo' })
        })
    })

    describe('eval', () => {
        it('Success', async () => {
            const { lsp } = await doConnect({ sendRequest: jest.fn(() => ({ text: 'Result text' })) })

            lsp.emit = jest.fn()
            await lsp.eval('Some text', 'Some package')

            expect(lsp.emit).toHaveBeenCalledTimes(2)
        })

        it('Failure', async () => {
            await networkErrorTest(
                (lsp) => lsp.eval('Some text', 'Some package'),
                (resp) => expect(resp).toBeUndefined()
            )
            await networkErrorTest(
                (lsp) => lsp.eval('Some text', 'Some package'),
                (resp) => expect(resp).toBeUndefined(),
                false
            )
        })

        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            guardsMock.isObject.mockImplementationOnce(() => false)
            lsp.emit = jest.fn()
            await lsp.eval('Some text', 'Some package')

            expect(lsp.emit).toHaveBeenCalledTimes(1)
        })
    })

    describe('inspext', () => {
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

                utilsMock.parseToInt.mockImplementationOnce((num: unknown) => num)
                lsp.emit = jest.fn()
                await fn(lsp)

                expect(lsp.emit).toHaveBeenCalled()
            }

            it('Success', async () => {
                await successTest((lsp) => lsp.inspect('Some text', 'Some package'))
                await successTest((lsp) => lsp.inspectMacro('Some text', 'Some package'))
                await successTest((lsp) => lsp.inspectSymbol({ name: 'foo', package: 'bar' }))
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.inspect('Some text', 'Some package'),
                    (resp) => expect(resp).toBeUndefined()
                )
            })
        })

        describe('doInspectMacro', () => {
            const successTest = async (
                fn: (lsp: LSP, info: Pick<InspectInfo, 'text' | 'package' | 'result'>) => Promise<void>
            ) => {
                const info = { text: 'Some text', package: 'Some package', result: {} }
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
                const { lsp } = await doConnect({ sendRequest: jest.fn(() => ({})) })

                guardsMock.isString.mockImplementationOnce(() => true)
                guardsMock.isObject.mockImplementationOnce(() => false)
                guardsMock.isString.mockImplementationOnce(() => false)

                lsp.emit = jest.fn()
                await lsp.inspectMacroInc({ text: 'Some text', package: 'Some package', result: {} })

                expect(lsp.emit).not.toHaveBeenCalled()
            })

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.inspectMacroInc({ text: 'Some text', package: 'Some package', result: [] }),
                    (resp) => expect(resp).toBeUndefined()
                )
            })
        })

        describe('inspectRefresh', () => {
            it('Success', async () => {
                const { lsp } = await doConnect({
                    sendRequest: jest.fn(() => []),
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
                const { lsp } = await doConnect({ sendRequest: jest.fn(() => 'foo') })

                guardsMock.isInspectResult.mockImplementationOnce(() => false)
                guardsMock.isString.mockImplementationOnce(() => false)

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
                const { lsp } = await doConnect({ sendRequest: jest.fn(() => ({ id: 10 })) })

                lsp.emit = jest.fn()
                await lsp.inspectEval(fakeInfo, 'Some eval text')

                expect(lsp.emit).toHaveBeenCalledTimes(1)
            })

            it('Success, invalid response', async () => {
                const { lsp } = await doConnect({ sendRequest: jest.fn(() => ({ id: 10 })) })

                guardsMock.isInspectResult.mockImplementationOnce(() => false)
                lsp.emit = jest.fn()
                await lsp.inspectEval(fakeInfo, 'Some eval text')

                expect(lsp.emit).toHaveBeenCalledTimes(1)
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

            it('Network error', async () => {
                await networkErrorTest(
                    (lsp) => lsp.inspectClosed(fakeInfo),
                    (resp) => expect(resp).toBeUndefined()
                )
            })
        })
    })
})
