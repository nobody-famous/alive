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
        const fakeEditor = {
            document: { uri: { toString: () => 'foo' } },
            selection: { active: new vscodeMock.Position() },
        }

        it('getSurroundingExprRange', async () => {
            const { lsp, clientMock } = await doConnect()

            await lsp.getSurroundingExprRange(fakeEditor)

            expect(clientMock.sendRequest).toHaveBeenCalledWith('$/alive/surroundingFormBounds', expect.anything())
        })

        it('getTopExprRange', async () => {
            const { lsp, clientMock } = await doConnect()

            await lsp.getTopExprRange(fakeEditor)

            expect(clientMock.sendRequest).toHaveBeenCalledWith('$/alive/topFormBounds', expect.anything())
        })

        it('Valid response', async () => {
            const fakePos = { line: 1, character: 5 }

            // Mock start position
            utilsMock.parseToInt.mockImplementationOnce(() => 1)
            utilsMock.parseToInt.mockImplementationOnce(() => 5)

            // Mock end position
            utilsMock.parseToInt.mockImplementationOnce(() => 1)
            utilsMock.parseToInt.mockImplementationOnce(() => 5)

            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => ({ start: fakePos, end: fakePos })),
            })

            expect(await lsp.getExprRange(fakeEditor, 'bar')).not.toBeUndefined()
        })

        it('Invalid response, parse pos fail', async () => {
            const fakePos = { line: 1, character: 5 }

            // Mock start position
            utilsMock.parseToInt.mockImplementationOnce(() => 1)
            utilsMock.parseToInt.mockImplementationOnce(() => undefined)

            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => ({ start: fakePos, end: 'Not valid' })),
            })

            expect(await lsp.getExprRange(fakeEditor, 'bar')).toBeUndefined()
        })

        it('Request failed', async () => {
            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => {
                    throw new Error('Failed, as requested')
                }),
            })

            expect(await lsp.getExprRange(fakeEditor, 'bar')).toBeUndefined()
        })
    })
})
