import { downloadLspServer, spawnLspProcess } from '../LspProcess'

jest.mock('axios')

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

const cpMock = jest.requireMock('child_process')
jest.mock('child_process')

const lspUtilsMock = jest.requireMock('../LspUtils')
jest.mock('../LspUtils')

const utilsMock = jest.requireMock('../../Utils')
jest.mock('../../Utils')

const procUtilsMock = jest.requireMock('../ProcUtils')
jest.mock('../ProcUtils')

const zipUtilsMock = jest.requireMock('../ZipUtils')
jest.mock('../ZipUtils')

jest.useFakeTimers()

describe('LspProcess tests', () => {
    describe('spawnLspProcess', () => {
        interface InitOpts {
            port: number
            onDisconnect: (code: number, signal: NodeJS.Signals | 'UNKNOWN') => void
            onError: (err: Error) => void
        }

        const defaultInitOpts: InitOpts = {
            port: 1234,
            onDisconnect: jest.fn(),
            onError: jest.fn(),
        }

        const defaultSpawnOpts = {
            lspInstallPath: '/install/path',
            workspacePath: '/workspace/path',
            command: [],
            onDisconnect: jest.fn(),
            onError: jest.fn(),
        }

        const initTest = async (initOpts: InitOpts = defaultInitOpts) => {
            const opts = Object.assign(defaultSpawnOpts, {
                onDisconnect: initOpts.onDisconnect,
                onError: initOpts.onError,
            })
            const cbs: Record<string, (...args: unknown[]) => void> = {}

            cpMock.spawn.mockReturnValueOnce({
                on: jest.fn((name, fn) => (cbs[name] = fn)),
                stdout: {
                    setEncoding: jest.fn(() => ({
                        on: jest.fn((name, fn) => {
                            if (name === 'data') {
                                cbs['stdout'] = fn
                            }
                        }),
                    })),
                },
                stderr: {
                    setEncoding: jest.fn(() => ({
                        on: jest.fn((name, fn) => {
                            if (name === 'data') {
                                cbs['stderr'] = fn
                            }
                        }),
                    })),
                },
            })

            procUtilsMock.waitForPort.mockReturnValueOnce(initOpts.port)
            procUtilsMock.startWarningTimer.mockImplementationOnce((fn: () => void) => {
                cbs['timer'] = fn
                return { cancel: jest.fn() }
            })

            const { child, port } = await spawnLspProcess(opts)

            return { child, port, cbs }
        }

        it('OK', async () => {
            const expectedPort = 1234
            const { child, port } = await initTest(Object.assign(defaultInitOpts, { port: expectedPort }))

            expect(child).not.toBeUndefined()
            expect(port).toBe(expectedPort)
        })

        describe('Callbacks', () => {
            it('exit', async () => {
                const disconnect = jest.fn()
                const { cbs } = await initTest(Object.assign(defaultInitOpts, { onDisconnect: disconnect }))

                cbs['exit']?.()
                expect(disconnect).toHaveBeenCalled()
            })

            it('disconnect', async () => {
                const disconnect = jest.fn()
                const { cbs } = await initTest(Object.assign(defaultInitOpts, { onDisconnect: disconnect }))

                cbs['disconnect']?.()
                expect(disconnect).toHaveBeenCalled()
            })

            it('error', async () => {
                const errorFn = jest.fn()
                const { cbs } = await initTest(Object.assign(defaultInitOpts, { onError: errorFn }))

                cbs['error']?.()
                expect(errorFn).toHaveBeenCalled()

                errorFn.mockReset()
                cbs['error']?.(new Error('Failed, as requested'))
                expect(errorFn).toHaveBeenCalled()
            })

            it('stdout/err', async () => {
                const { cbs } = await initTest()

                cbs['stdout']?.()
                cbs['stderr']?.()
            })

            it('timer', async () => {
                const { cbs } = await initTest()

                cbs['timer']?.()
                expect(vscodeMock.window.showWarningMessage).toHaveBeenCalled()
            })
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
