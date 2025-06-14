import { LispRepl } from '../LispRepl'
import { createFakeWebview } from './utils'

describe('LispRepl tests', () => {
    const fakeContext = { subscriptions: [], extensionPath: '/some/path' }

    const createRepl = () => {
        const repl = new LispRepl(fakeContext, 'v1.0')
        const webview = createFakeWebview()
        let cb: ((msg: { command: string; text?: string }) => void) | undefined

        webview.onDidReceiveMessage.mockImplementationOnce((fn) => {
            cb = fn
        })
        repl.resolveWebviewView({ webview, onDidChangeVisibility: jest.fn() })

        return { repl, webview, cb }
    }

    it('resolveWebviewView', () => {
        const { webview } = createRepl()

        expect(webview.html).toContain('<html>')
    })

    describe('setPackage', () => {
        it('Has view', () => {
            const { repl, webview } = createRepl()

            repl.setPackage('Some package')

            expect(webview.postMessage).toHaveBeenCalled()
        })

        it('No view', () => {
            const repl = new LispRepl(fakeContext, 'v1.0')

            repl.setPackage('Some package')
        })
    })

    describe('setInput', () => {
        it('Has view', () => {
            const { repl, webview } = createRepl()

            repl.setInput('Some input')

            expect(webview.postMessage).toHaveBeenCalled()
        })

        it('No view', () => {
            const repl = new LispRepl(fakeContext, 'v1.0')

            repl.setInput('Some input')
        })
    })

    describe('clearInput', () => {
        it('Has view', () => {
            const { repl, webview } = createRepl()

            repl.clearInput()

            expect(webview.postMessage).toHaveBeenCalled()
        })

        it('No view', () => {
            const repl = new LispRepl(fakeContext, 'v1.0')

            repl.clearInput()
        })
    })

    describe('addOutput', () => {
        it('First try', () => {
            const { repl, webview } = createRepl()

            repl.addOutput('Some text')

            expect(webview.postMessage).toHaveBeenCalled()
        })

        it('Second try', () => {
            const { repl, webview } = createRepl()

            repl.addOutput('Some text')
            repl.addOutput('Some more text')

            expect(webview.postMessage).toHaveBeenCalledTimes(2)
        })

        it('No view', () => {
            const repl = new LispRepl(fakeContext, 'v1.0')

            repl.addOutput('Some text')
        })
    })

    it('Messages', () => {
        const { cb, repl } = createRepl()

        repl.emit = jest.fn()
        cb?.({ command: 'eval' })
        expect(repl.emit).not.toHaveBeenCalled()

        cb?.({ command: 'outputConnected' })
        expect(repl.emit).not.toHaveBeenCalled()

        cb?.({ command: 'eval', text: 'foo' })
        cb?.({ command: 'requestPackage' })
        cb?.({ command: 'historyUp' })
        cb?.({ command: 'historyDown' })
        cb?.({ command: 'userInput' })
        cb?.({ command: 'userInput', text: 'foo' })

        expect(repl.emit).toHaveBeenCalledTimes(6)
    })

    describe('clear', () => {
        it('should clear REPL output and notify webview', () => {
            const { repl, webview } = createRepl()

            repl.addOutput('test output')
            repl.addOutput('test input', 'cl-user')

            repl.clear()

            expect(webview.postMessage).toHaveBeenCalledWith({
                type: 'clear',
            })
        })

        it('should clear REPL output and skip webview notification when view is undefined', () => {
            const { repl, webview } = createRepl()

            repl.view = undefined
            repl.addOutput('test output')
            repl.addOutput('test input', 'cl-user')

            repl.clear()

            expect(webview.postMessage).not.toHaveBeenCalled()
        })
    })

    describe('toggleWordWrap', () => {
        it('Has view', () => {
            const { repl, webview } = createRepl()

            repl.toggleWordWrap()

            expect(webview.postMessage).toHaveBeenCalledWith({
                type: 'toggleWordWrap',
            })
        })

        it('No view', () => {
            const repl = new LispRepl(fakeContext, 'v1.0')

            repl.toggleWordWrap()
        })
    })

    describe('setReplOutput', () => {
        it('Has view', () => {
            const { repl, webview } = createRepl()

            repl.setReplOutput()

            expect(webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'setReplOutput',
                })
            )
        })

        it('No view', () => {
            const repl = new LispRepl(fakeContext, 'v1.0')

            repl.setReplOutput()
        })
    })

    describe('addInput', () => {
        it('should add input with package name when view exists', () => {
            const { repl, webview } = createRepl()

            repl.addOutput('test input', 'cl-user')

            expect(webview.postMessage).toHaveBeenCalledWith({
                type: 'appendOutput',
                output: {
                    pkgName: 'cl-user',
                    text: 'test input',
                },
            })
        })

        it('should handle undefined view', () => {
            const repl = new LispRepl(fakeContext, 'v1.0')

            expect(() => repl.addOutput('test input', 'cl-user')).not.toThrow()
        })
    })
})
