import { LSP } from '../LSP'

const nodeMock = jest.requireMock('vscode-languageclient/node')
jest.mock('vscode-languageclient/node')

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

describe('LSP tests', () => {
    describe('connect', () => {
        it('Success', async () => {
            const clientMock = {
                start: jest.fn(),
                onReady: jest.fn(),
                onNotification: jest.fn(),
                onRequest: jest.fn(),
            }
            nodeMock.LanguageClient.mockImplementationOnce(() => clientMock)

            const lsp = new LSP({ hoverText: '' })
            await lsp.connect({ host: 'foo', port: 1234 })

            expect(clientMock.start).toHaveBeenCalled()
            expect(clientMock.onRequest).toHaveBeenCalled()
        })

        it('Failed', async () => {
            const clientMock = {
                start: jest.fn(),
                onReady: () => {
                    throw new Error('Failed, as requested')
                },
                onNotification: jest.fn(),
                onRequest: jest.fn(),
            }
            nodeMock.LanguageClient.mockImplementationOnce(() => clientMock)

            const lsp = new LSP({ hoverText: '' })
            await expect(async () => await lsp.connect({ host: 'foo', port: 1234 })).rejects.toThrow()

            expect(clientMock.start).toHaveBeenCalled()
            expect(clientMock.onRequest).not.toHaveBeenCalled()
        })
    })

    describe('getHoverText', () => {
        it('No response', async () => {
            const lsp = new LSP({ hoverText: '' })

            await lsp.getHoverText('foo', new vscodeMock.Position())
        })
    })
})
