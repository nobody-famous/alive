import { downloadLspServer } from '../LspProcess'

jest.mock('axios')

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const lspUtilsMock = jest.requireMock('../LspUtils')
jest.mock('../LspUtils')

const utilsMock = jest.requireMock('../../Utils')
jest.mock('../../Utils')

const zipUtilsMock = jest.requireMock('../ZipUtils')
jest.mock('../zipUtils')

describe('LspProcess tests', () => {
    describe('downloadLspServer', () => {
        const fakeExtension = { extensionPath: 'some path' }
        it('No versions', async () => {
            utilsMock.getLspBasePath.mockReturnValueOnce('/some/path')
            lspUtilsMock.getLatestVersion.mockReturnValueOnce(undefined)
            lspUtilsMock.getInstalledVersion.mockReturnValueOnce(undefined)

            const resp = await downloadLspServer(fakeExtension, 'some url')

            expect(resp).toBeUndefined()
        })

        it('No version installed', async () => {
            utilsMock.getLspBasePath.mockReturnValueOnce('/some/path')
            lspUtilsMock.getLatestVersion.mockReturnValueOnce({ name: 'Test LSP Version' })
            lspUtilsMock.pullLatestVersion.mockReturnValueOnce('/latest/version/path')
            lspUtilsMock.getInstalledVersion.mockReturnValueOnce(undefined)

            const resp = await downloadLspServer(fakeExtension, 'some url')

            expect(resp).toBe('/latest/version/path')
        })

        it('Have installed version, no latest found', async () => {
            utilsMock.getLspBasePath.mockReturnValueOnce('/some/path')
            lspUtilsMock.getLatestVersion.mockReturnValueOnce(undefined)
            lspUtilsMock.getInstalledVersion.mockReturnValueOnce('v1')
            zipUtilsMock.getUnzippedPath.mockReturnValueOnce('/unzipped/path')

            const resp = await downloadLspServer(fakeExtension, 'some url')

            expect(resp).toBe('/unzipped/path')
        })

        it('Installed version not latest', async () => {
            utilsMock.getLspBasePath.mockReturnValueOnce('/some/path')
            lspUtilsMock.getLatestVersion.mockReturnValueOnce({ name: 'Test LSP Version', tagName: 'v2' })
            lspUtilsMock.pullLatestVersion.mockReturnValueOnce('/latest/version/path')
            lspUtilsMock.getInstalledVersion.mockReturnValueOnce('v1')

            const resp = await downloadLspServer(fakeExtension, 'some url')

            expect(resp).toBe('/latest/version/path')
        })

        it('Installed version is latest', async () => {
            utilsMock.getLspBasePath.mockReturnValueOnce('/some/path')
            lspUtilsMock.getLatestVersion.mockReturnValueOnce({ name: 'Test LSP Version', tagName: 'v1' })
            lspUtilsMock.getInstalledVersion.mockReturnValueOnce('v1')
            zipUtilsMock.getUnzippedPath.mockReturnValueOnce('/unzipped/path')

            const resp = await downloadLspServer(fakeExtension, 'some url')

            expect(resp).toBe('/unzipped/path')
        })

        it('Pull latest fail', async () => {
            utilsMock.getLspBasePath.mockReturnValueOnce('/some/path')
            lspUtilsMock.getLatestVersion.mockReturnValueOnce({ name: 'Test LSP Version', tagName: 'v1' })
            lspUtilsMock.pullLatestVersion.mockImplementationOnce(() => {
                throw new Error('Failed, as requested')
            })
            lspUtilsMock.getInstalledVersion.mockReturnValueOnce(undefined)

            const resp = await downloadLspServer(fakeExtension, 'some url')

            expect(resp).toBe(undefined)
        })
    })
})