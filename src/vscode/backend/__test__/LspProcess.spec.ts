import { downloadLspServer } from '../LspProcess'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

jest.mock('axios')

describe('LspProcess tests', () => {
    describe('downloadLspServer', () => {
        it('Have install path', async () => {
            vscodeMock.workspace.getConfiguration.mockReturnValueOnce({ get: () => '/some/path' })
            const resp = await downloadLspServer()

            expect(resp).toBe('/some/path')
        })

        it('Base path', async () => {
            vscodeMock.workspace.getConfiguration.mockReturnValueOnce({ get: () => undefined })
            vscodeMock.extensions.getExtension.mockReturnValueOnce(undefined)

            const resp = await downloadLspServer()

            expect(resp).toBeUndefined()
        })

        it('Latest version no url', async () => {
            vscodeMock.workspace.getConfiguration.mockReturnValueOnce({ get: () => undefined })
            vscodeMock.workspace.getConfiguration.mockReturnValueOnce({ lsp: { downloadUrl: 'url' } })
            vscodeMock.extensions.getExtension.mockReturnValueOnce({ extensionPath: '/some/path' })

            const resp = await downloadLspServer()

            expect(resp).toBeUndefined()
        })
    })
})
