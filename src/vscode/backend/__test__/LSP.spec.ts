import { LSP } from '../LSP'

const nodeMock = jest.requireMock('vscode-languageclient/node')
jest.mock('vscode-languageclient/node')

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const utilsMock = jest.requireMock('../../Utils')
jest.mock('../../Utils')

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

    describe('getHoverText', () => {
        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            expect(await lsp.getHoverText('/some/file', new vscodeMock.Position())).toBe('')
        })

        it('Invalid response', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => 'foo'),
            })

            expect(await lsp.getHoverText('/some/file', new vscodeMock.Position())).toBe('')
        })

        it('Valid response', async () => {
            utilsMock.strToMarkdown.mockImplementationOnce((v: string) => v)

            const { lsp, clientMock } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => ({
                    value: 'foo',
                })),
            })

            expect(await lsp.getHoverText('/some/file', new vscodeMock.Position())).toBe('foo')
            expect(clientMock.sendRequest).toHaveBeenCalledWith('textDocument/hover', expect.anything())
        })

        it('Request fail', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => {
                    throw new Error('Failed, as requested')
                }),
            })

            expect(await lsp.getHoverText('/some/file', new vscodeMock.Position())).toBe('')
        })
    })

    describe('getSymbol', () => {
        it('No client', async () => {
            const lsp = new LSP({ hoverText: '' })

            expect(await lsp.getSymbol('/some/file', new vscodeMock.Position())).toBeUndefined()
        })

        it('Valid response', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => ({
                    value: ['foo', 'bar'],
                })),
            })

            expect(await lsp.getSymbol('/some/file', new vscodeMock.Position())).toMatchObject({ name: 'foo', package: 'bar' })
        })

        it('Invalid response', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => ({
                    value: ['foo'],
                })),
            })

            expect(await lsp.getSymbol('/some/file', new vscodeMock.Position())).toBeUndefined()
        })

        it('Request fail', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => {
                    throw new Error('Failed, as requested')
                }),
            })

            expect(await lsp.getSymbol('/some/file', new vscodeMock.Position())).toBeUndefined()
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
                sendRequest: jest.fn().mockImplementation(() => ({ start: fakePos, end: fakePos })),
            })

            expect(await lsp.getExprRange('bar', 'foo', fakeSelection)).not.toBeUndefined()
        })

        it('Invalid response, parse pos fail', async () => {
            const fakePos = { line: 1, character: 5 }

            utilsMock.parsePos.mockImplementationOnce(() => fakePos)

            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => ({ start: fakePos, end: 'Not valid' })),
            })

            expect(await lsp.getExprRange('bar', 'foo', fakeSelection)).toBeUndefined()
        })

        it('Request failed', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => {
                    throw new Error('Failed, as requested')
                }),
            })

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
                sendRequest: jest.fn().mockImplementation(() => {
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
                sendRequest: jest.fn().mockImplementation(() => {
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
                sendRequest: jest.fn().mockImplementation(() => testPkg),
            })

            const pkg = await lsp.getPackage('uri', new vscodeMock.Position())

            validate(pkg)
        }

        it('Success', async () => {
            await runTest({ package: 'foo' }, (pkg) => expect(pkg).toBe('foo'))
        })

        it('Invalid package', async () => {
            await runTest({}, (pkg) => expect(pkg).toBeUndefined())
            await runTest('foo', (pkg) => expect(pkg).toBeUndefined())
            await runTest({ package: 5 }, (pkg) => expect(pkg).toBeUndefined())
        })

        it('Fail', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => {
                    throw new Error('Failed, as requested')
                }),
            })

            const pkg = await lsp.getPackage('uri', new vscodeMock.Position())

            expect(pkg).toBeUndefined()
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
                sendRequest: jest.fn().mockImplementation(() => ({ package: 'Some package' })),
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
                sendRequest: jest.fn().mockImplementation((method: string) => {
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
                sendRequest: jest.fn().mockImplementation(() => ({ package: 'Some package' })),
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
                sendRequest: jest.fn().mockImplementation(() => fakeResp),
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

        it('Failure', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => {
                    throw new Error('Failed, as requested')
                }),
            })

            const macro = await lsp.macroexpand('Some text', 'Some package')

            expect(macro).toBeUndefined()
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
                sendRequest: jest.fn().mockImplementation(() => ({ package: 'Some package' })),
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
                sendRequest: jest.fn().mockImplementation(() => ({ messages: [1, 2, 3] })),
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

            const resp = await lsp.tryCompileFile('/some/path')

            expect(resp).toMatchObject({ notes: [] })
        })

        it('Failure', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => {
                    throw new Error('Failed, as requested')
                }),
            })

            const resp = await lsp.tryCompileFile('/some/path')

            expect(resp).toMatchObject({ notes: [] })
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
                sendRequest: jest.fn().mockImplementation(() => ({ messages: [] })),
            })

            await lsp.loadFile('/some/path')
        })

        it('Success, with messages', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => ({
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
                sendRequest: jest.fn().mockImplementation(() => {
                    throw new Error('Failed, as requested')
                }),
            })

            lsp.emit = jest.fn()
            await lsp.loadFile('/some/path')

            expect(lsp.emit).toHaveBeenCalledTimes(1)
        })

        it('Failure, as not error', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => {
                    throw 'Failed, as requested'
                }),
            })

            lsp.emit = jest.fn()
            await lsp.loadFile('/some/path')

            expect(lsp.emit).toHaveBeenCalledTimes(1)
        })
    })
})
