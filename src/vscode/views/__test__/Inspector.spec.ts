import { InspectInfo } from '../../Types'
import { Inspector } from '../Inspector'
import { createPanel } from './utils'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

describe('Inspector tests', () => {
    const defaultInfo: InspectInfo = {
        id: 5,
        resultType: 'foo',
        result: {},
        text: 'Some text',
        package: 'Some package',
    }

    const showPanel = (options: Record<string, unknown>) => {
        const info = Object.assign({}, defaultInfo, options)
        const panel = createPanel()
        const inspector = new Inspector('/some/path', vscodeMock.ViewColumn.Two, info)

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        inspector.show()

        return { panel, inspector }
    }

    describe('Show', () => {
        it('Not macro', () => {
            const { panel } = showPanel({ resultType: 'not-macro' })

            expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
            expect(panel.webview.html).not.toContain('inspector-macro-data')
        })

        it('Macro', () => {
            const { panel } = showPanel({ resultType: 'macro' })

            expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
            expect(panel.webview.html).toContain('inspector-macro-data')
        })
    })

    describe('Panel callbacks', () => {
        it('onDidDispose', () => {
            const panel = createPanel()
            const inspector = new Inspector('/some/path', vscodeMock.ViewColumn.Two, defaultInfo)
            let cb: (() => void) | undefined

            panel.onDidDispose.mockImplementationOnce((fn: () => void) => {
                cb = fn
            })
            vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)

            inspector.emit = jest.fn()

            inspector.show()
            cb?.()

            expect(inspector.emit).toHaveBeenCalled()
        })

        it('onDidReceiveMessage', () => {
            const panel = createPanel()
            const inspector = new Inspector('/some/path', vscodeMock.ViewColumn.Two, defaultInfo)
            let cb: ((msg: { command: string }) => void) | undefined

            panel.webview.onDidReceiveMessage.mockImplementationOnce((fn: () => void) => {
                cb = fn
            })
            vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)

            inspector.emit = jest.fn()

            inspector.show()
            cb?.({ command: 'VALUE' })
            cb?.({ command: 'ACTION' })
            cb?.({ command: 'EVAL' })
            cb?.({ command: 'EXPINC' })
            cb?.({ command: 'REFRESH' })

            expect(inspector.emit).toHaveBeenCalledWith('inspect-part', undefined)
            expect(inspector.emit).toHaveBeenCalledWith('inspector-action', undefined)
            expect(inspector.emit).toHaveBeenCalledWith('inspector-eval', undefined)
            expect(inspector.emit).toHaveBeenCalledWith('inspector-macro-inc')
            expect(inspector.emit).toHaveBeenCalledWith('inspector-refresh')
        })

        it('onDidReceiveMessage macro', () => {
            const panel = createPanel()
            const info = Object.assign({}, defaultInfo, { resultType: 'macro' })
            const inspector = new Inspector('/some/path', vscodeMock.ViewColumn.Two, info)
            let cb: ((msg: { command: string }) => void) | undefined

            panel.webview.onDidReceiveMessage.mockImplementationOnce((fn: () => void) => {
                cb = fn
            })
            vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)

            inspector.emit = jest.fn()

            inspector.show()
            cb?.({ command: 'REFRESH' })

            expect(inspector.emit).toHaveBeenCalledWith('inspector-refresh-macro')
        })
    })

    describe('renderFields', () => {
        it('Result not object', () => {
            const { panel } = showPanel({ result: 5 })

            expect(panel.webview.html).not.toContain('inspector-macro-data')
        })

        it('Result not object', () => {
            const { panel } = showPanel({ result: { foo: 'bar', value: 5 } })

            expect(panel.webview.html).toContain('inspector-row-key')
            expect(panel.webview.html).toContain('inspector-row-value')
        })

        it('Result value has array', () => {
            const { panel } = showPanel({ result: { foo: 'bar', value: ['bar', 'baz'] } })

            expect(panel.webview.html).toContain('inspector-row-key')
            expect(panel.webview.html).toContain('inspector-row-value')
        })

        it('Result value has object', () => {
            const { panel } = showPanel({ result: { foo: 'bar', value: { bar: 'baz' } } })

            expect(panel.webview.html).toContain('inspector-row-key')
            expect(panel.webview.html).toContain('inspector-row-value')
        })

        it('Result value has null object', () => {
            const { panel } = showPanel({ result: { foo: 'bar', value: null } })

            expect(panel.webview.html).toContain('inspector-row-key')
            expect(panel.webview.html).toContain('inspector-row-value')
        })
    })
})
