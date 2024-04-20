import { AliveContext, DebugInfo } from '../../Types'
import { DebugView } from '../DebugView'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

describe('DebugView tests', () => {
    const fakeContext: AliveContext = {
        subscriptions: [],
        extensionPath: '/some/path',
    }
    const fakeDebugInfo: DebugInfo = {
        message: 'Fake Message',
        restarts: [],
        stackTrace: [],
    }
    const createPanel = () => ({
        dispose: jest.fn(),
        onDidDispose: jest.fn(),
        onDidChangeViewState: jest.fn(),
        webview: {
            html: '',
            asWebviewUri: jest.fn(),
            onDidReceiveMessage: jest.fn(),
        },
    })

    it('Dispose old panel', () => {
        const view = new DebugView(fakeContext, 'Title', vscodeMock.ViewColumn.Two, fakeDebugInfo)
        const panel = createPanel()

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        view.run()
        expect(panel.dispose).not.toHaveBeenCalled()

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        view.run()

        expect(panel.dispose).toHaveBeenCalled()
        expect(panel.webview.html).not.toContain('restart-item')
    })

    it('Stop', () => {
        const info = Object.assign({}, fakeDebugInfo, { restarts: [{ name: 'foo', description: 'foo restart' }] })
        const view = new DebugView(fakeContext, 'Title', vscodeMock.ViewColumn.Two, info)
        const panel = createPanel()

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        view.run()
        expect(panel.dispose).not.toHaveBeenCalled()

        view.stop()
        expect(panel.dispose).toHaveBeenCalled()
    })

    it('Restarts', () => {
        const info = Object.assign({}, fakeDebugInfo, { restarts: [{ name: 'foo', description: 'foo restart' }] })
        const view = new DebugView(fakeContext, 'Title', vscodeMock.ViewColumn.Two, info)
        const panel = createPanel()

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        view.run()

        expect(panel.webview.html).toContain('restart-item')
    })

    it('Stacktrace', () => {
        const info = Object.assign({}, fakeDebugInfo, {
            stackTrace: [
                { function: 'foo', file: 'bar', position: { line: 5, character: 10 } },
                { function: 'foo', file: null, position: null },
            ],
        })
        const view = new DebugView(fakeContext, 'Title', vscodeMock.ViewColumn.Two, info)
        const panel = createPanel()

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        view.run()

        expect(panel.webview.html).toContain('stacktrace-item')
    })
})
