import { AliveConfig, readAliveConfig } from '../config'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

describe('Config Tests', () => {
    describe('readAliveConfig', () => {
        const runTest = (fakeCfg: unknown, validate: (cfg: AliveConfig) => void) => {
            vscodeMock.workspace.getConfiguration.mockImplementationOnce(() => fakeCfg)

            validate(readAliveConfig())
        }

        it('Basic settings', () => {
            runTest({}, (cfg) => expect(cfg.enableDiagnostics).toBe(true))
            runTest({ enableDiagnostics: false }, (cfg) => expect(cfg.enableDiagnostics).toBe(false))
        })

        it('LSP settings', () => {
            runTest({ lsp: { install: { path: 'foo' } } }, (cfg) => expect(cfg.lsp.install.path).toBe('foo'))
            runTest({ lsp: { downloadUrl: 'bar' } }, (cfg) => expect(cfg.lsp.downloadUrl).toBe('bar'))
            runTest({ lsp: { remote: { host: 'baz' } } }, (cfg) => expect(cfg.lsp.remote.host).toBe('baz'))
            runTest({ lsp: { remote: { port: 1234 } } }, (cfg) => expect(cfg.lsp.remote.port).toBe(1234))
            runTest({ lsp: { startCommand: ['bar'] } }, (cfg) => expect(cfg.lsp.startCommand).toMatchObject(['bar']))
        })

        it('Package tree settings', () => {
            runTest({}, (cfg) => expect(cfg.packageTree.separator).toBe(null))
            runTest({ packageTree: { separator: '/' } }, (cfg) => expect(cfg.packageTree.separator).toBe('/'))
            runTest({ packageTree: { separator: ['/', '-'] } }, (cfg) =>
                expect(cfg.packageTree.separator).toStrictEqual(['/', '-'])
            )
        })
    })
})
