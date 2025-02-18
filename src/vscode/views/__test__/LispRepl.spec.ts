import { LispRepl } from '../LispRepl'
import { createFakeWebview } from './utils'

jest.useFakeTimers()

describe('LispRepl tests', () => {
    const fakeContext = { subscriptions: [], extensionPath: '/some/path' }

    const createRepl = () => {
        const repl = new LispRepl(fakeContext)
        const webview = createFakeWebview()
        let cb: ((msg: { command: string; text?: string }) => void) | undefined

        webview.onDidReceiveMessage.mockImplementationOnce((fn) => {
            cb = fn
        })
        repl.resolveWebviewView({ webview, onDidChangeVisibility: jest.fn() })

        return { repl, webview, cb }
    }

    it('changeVisibility', () => {
        const repl = new LispRepl(fakeContext)
        const webview = createFakeWebview()
        let fn: (() => void) | undefined

        repl.resolveWebviewView({
            webview,
            onDidChangeVisibility: (f) => {
                fn = f
                return { dispose: jest.fn() }
            },
        })

        fn?.()

        expect(webview.postMessage).toHaveBeenCalled()
    })

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
            const repl = new LispRepl(fakeContext)

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
            const repl = new LispRepl(fakeContext)

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
            const repl = new LispRepl(fakeContext)

            repl.clearInput()
        })
    })

    describe('getUserInput', () => {
        it('Has view', () => {
            const { repl, webview } = createRepl()

            repl.getUserInput()

            expect(webview.postMessage).toHaveBeenCalled()
        })

        it('No view', () => {
            const repl = new LispRepl(fakeContext)

            repl.getUserInput()
        })
    })

    describe('addOutput', () => {
        it('First try', () => {
            const { repl, webview } = createRepl()

            repl.addOutput('Some text')

            jest.runAllTimers()

            expect(webview.postMessage).toHaveBeenCalled()
        })

        it('Second try', () => {
            const { repl, webview } = createRepl()

            repl.addOutput('Some text')
            repl.addOutput('Some more text')

            jest.runAllTimers()

            expect(webview.postMessage).toHaveBeenCalledTimes(2)
        })

        it('No view', () => {
            const repl = new LispRepl(fakeContext)

            repl.addOutput('Some text')

            jest.runAllTimers()
        })
    })

    it('Messages', () => {
        const { cb, repl } = createRepl()

        repl.emit = jest.fn()
        cb?.({ command: 'eval' })
        expect(repl.emit).not.toHaveBeenCalled()

        cb?.({ command: 'eval', text: 'foo' })
        cb?.({ command: 'requestPackage' })
        cb?.({ command: 'historyUp' })
        cb?.({ command: 'historyDown' })
        cb?.({ command: 'userInput' })
        cb?.({ command: 'userInput', text: 'foo' })

        expect(repl.emit).toHaveBeenCalledTimes(6)
    })
})
