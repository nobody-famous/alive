import { AliveContext, DebugInfo } from '../../Types'
import { DebugView, jsMessage } from '../DebugView'

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

        view.stop()
        expect(panel.dispose).not.toHaveBeenCalled()

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
        view.emit = jest.fn()
        view.run()

        expect(panel.webview.html).toContain('stacktrace-item')
    })

    describe('Commands', () => {
        const getCallback = () => {
            const view = new DebugView(fakeContext, 'Title', vscodeMock.ViewColumn.Two, fakeDebugInfo)
            const panel = createPanel()
            let cb: (msg: jsMessage) => void = jest.fn()

            panel.webview.onDidReceiveMessage.mockImplementationOnce((fn) => {
                cb = fn
            })

            vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
            view.emit = jest.fn()
            view.run()

            return { view, cb }
        }

        describe('jumpTo', () => {
            it('No data', () => {
                const { view, cb } = getCallback()

                cb({ command: 'jump_to' })

                expect(view.emit).not.toHaveBeenCalled()
            })

            it('Have data', () => {
                const { view, cb } = getCallback()

                cb({ command: 'jump_to', file: 'foo', line: 5, char: 10 })

                expect(view.emit).toHaveBeenCalled()
            })
        })

        it('restart', () => {
            const { view, cb } = getCallback()

            cb({ command: 'restart' })
            expect(view.emit).not.toHaveBeenCalled()

            cb({ command: 'restart', number: 5 })
            expect(view.emit).toHaveBeenCalled()
        })

        it('inspectCond', () => {
            const { cb } = getCallback()

            cb({ command: 'inspect_cond' })
        })
    })

    it('onDidChangeViewState', () => {
        const view = new DebugView(fakeContext, 'Title', vscodeMock.ViewColumn.Two, fakeDebugInfo)
        const panel = createPanel()
        let cb: () => void = jest.fn()

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        panel.onDidChangeViewState.mockImplementationOnce((fn) => {
            cb = fn
        })

        view.run()
        cb()

        expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
    })

    it('onDispose', () => {
        const view = new DebugView(fakeContext, 'Title', vscodeMock.ViewColumn.Two, fakeDebugInfo)
        const panel = createPanel()
        let cb: () => void = jest.fn()

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        panel.onDidDispose.mockImplementationOnce((fn) => {
            cb = fn
        })

        view.emit = jest.fn()
        view.run()
        cb()

        expect(view.emit).toHaveBeenCalledWith('debugClosed')
    })
})
