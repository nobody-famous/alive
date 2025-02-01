import { InspectInfo } from '../../Types'
import { Inspector, Message } from '../Inspector'
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

    const showInspector = (options: Record<string, unknown>) => {
        const info = Object.assign({}, defaultInfo, options)
        const panel = createPanel()
        const inspector = new Inspector('/some/path', vscodeMock.ViewColumn.Two, info)

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        inspector.show()

        return inspector
    }

    describe('Show', () => {
        it('Already visible', () => {
            const inspector = showInspector({ resultType: 'not-macro' })

            vscodeMock.window.createWebviewPanel.mockReturnValueOnce(createPanel())
            inspector.show()

            expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
        })

        it('Not macro', () => {
            const inspector = showInspector({ resultType: 'not-macro' })

            expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
            expect(inspector.panel?.webview.html).not.toContain('inspector-macro-data')
        })

        it('Macro', () => {
            const inspector = showInspector({ resultType: 'macro' })

            expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
            expect(inspector.panel?.webview.html).toContain('inspector-macro-data')
        })

        it('Macro result string', () => {
            const inspector = showInspector({ resultType: 'macro', result: 'foo' })

            expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
            expect(inspector.panel?.webview.html).toContain('inspector-macro-data')
        })
    })

    it('stop', () => {
        const inspector = new Inspector('/some/path', vscodeMock.ViewColumn.Two, defaultInfo)

        inspector.stop()

        expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
    })

    describe('update', () => {
        it('No panel', () => {
            const inspector = new Inspector('/some/path', vscodeMock.ViewColumn.Two, defaultInfo)
            const data = { id: 5, resultType: 'foo', result: {} }

            inspector.update(data)

            expect(inspector.panel).toBeUndefined()
        })

        it('With panel', () => {
            const inspector = showInspector({})
            const data = { id: 5, resultType: 'foo', result: {} }

            inspector.update(data)

            expect(inspector.panel?.webview.html).toContain('<html>')
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
            let cb: ((msg: Message) => void) | undefined

            panel.webview.onDidReceiveMessage.mockImplementationOnce((fn: () => void) => {
                cb = fn
            })
            vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)

            inspector.emit = jest.fn()

            inspector.show()
            cb?.({ command: 'VALUE', index: 5 })
            cb?.({ command: 'ACTION', index: 10 })
            cb?.({ command: 'EVAL', text: 'foo' })
            cb?.({ command: 'EXPINC' })
            cb?.({ command: 'REFRESH' })

            expect(inspector.emit).toHaveBeenCalledWith('inspectPart', 5)
            expect(inspector.emit).toHaveBeenCalledWith('inspectorAction', 10)
            expect(inspector.emit).toHaveBeenCalledWith('inspectorEval', 'foo')
            expect(inspector.emit).toHaveBeenCalledWith('inspectorMacroInc')
            expect(inspector.emit).toHaveBeenCalledWith('inspectorRefresh')
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

            expect(inspector.emit).toHaveBeenCalledWith('inspectorRefreshMacro')
        })
    })

    describe('renderFields', () => {
        it('Result not object', () => {
            const inspector = showInspector({ result: 5 })

            expect(inspector.panel?.webview.html).not.toContain('inspector-macro-data')
        })

        it('Result not object', () => {
            const inspector = showInspector({ result: { foo: 'bar', value: 5 } })

            expect(inspector.panel?.webview.html).toContain('inspector-row-key')
            expect(inspector.panel?.webview.html).toContain('inspector-row-value')
        })

        it('Result not object', () => {
            const inspector = showInspector({ result: { foo: 10, value: 'value' } })

            expect(inspector.panel?.webview.html).toContain('inspector-row-key')
            expect(inspector.panel?.webview.html).toContain('inspector-row-value')
        })

        it('Result value has array', () => {
            const inspector = showInspector({ result: { foo: 'bar', value: ['bar', 5] } })

            expect(inspector.panel?.webview.html).toContain('inspector-row-key')
            expect(inspector.panel?.webview.html).toContain('inspector-row-value')
        })

        it('Result value has object', () => {
            const inspector = showInspector({ result: { foo: 'bar', value: { bar: 'baz', a: 5 } } })

            expect(inspector.panel?.webview.html).toContain('inspector-row-key')
            expect(inspector.panel?.webview.html).toContain('inspector-row-value')
        })

        it('Result value has null object', () => {
            const inspector = showInspector({ result: { foo: 'bar', value: null } })

            expect(inspector.panel?.webview.html).toContain('inspector-row-key')
            expect(inspector.panel?.webview.html).toContain('inspector-row-value')
        })
    })
})
