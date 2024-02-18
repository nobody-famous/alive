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

            const { lsp } = await doConnect({
                sendRequest: jest.fn().mockImplementation(() => ({
                    value: 'foo',
                })),
            })

            expect(await lsp.getHoverText('/some/file', new vscodeMock.Position())).toBe('foo')
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
})
