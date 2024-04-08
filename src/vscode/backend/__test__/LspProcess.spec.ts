import { downloadLspServer } from '../LspProcess'

jest.mock('axios')

const lspUtilsMock = jest.requireMock('../LspUtils')
jest.mock('../LspUtils')

const utilsMock = jest.requireMock('../../Utils')
jest.mock('../../Utils')

const procUtilsMock = jest.requireMock('../ProcUtils')
jest.mock('../ProcUtils')

const zipUtilsMock = jest.requireMock('../ZipUtils')
jest.mock('../ZipUtils')

describe('LspProcess tests', () => {
    describe('listenForServerPort', () => {
        // const fakeState = {
        //     lspInstallPath: '/lsp/path',
        //     workspacePath: '/workspace/path',
        // }

        beforeEach(() => {
            procUtilsMock.startWarningTimer.mockReturnValueOnce({ cancel: jest.fn() })
        })

        it('No command', () => {
            // expect(async () => await startLspServer(fakeState, [])).rejects.toThrow()
            // expect(procUtilsMock.waitForPort).not.toHaveBeenCalled()
        })
    })

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
