import { LispRepl } from '../LispRepl'
import { createFakeWebview } from './utils'

describe('LispRepl tests', () => {
    const fakeContext = { subscriptions: [], extensionPath: '/some/path' }

    const createRepl = () => {
        const repl = new LispRepl(fakeContext)
        const webview = createFakeWebview()

        repl.resolveWebviewView({ webview, onDidChangeVisibility: jest.fn() })

        return { repl, webview }
    }

    it('resolveWebviewView', () => {
        const { webview } = createRepl()

        expect(webview.html).toContain('<html>')
    })

    it('clear', () => {
        const { repl, webview } = createRepl()

        repl.clear()

        expect(webview.postMessage).toHaveBeenCalled()
    })

    it('restoreState', () => {
        const { repl, webview } = createRepl()

        repl.restoreState()

        expect(webview.postMessage).toHaveBeenCalledTimes(2)
    })

    it('setPackage', () => {
        const { repl, webview } = createRepl()

        repl.setPackage('Some package')

        expect(webview.postMessage).toHaveBeenCalled()
    })

    it('setInput', () => {
        const { repl, webview } = createRepl()

        repl.setInput('Some input')

        expect(webview.postMessage).toHaveBeenCalled()
    })

    it('clearInput', () => {
        const { repl, webview } = createRepl()

        repl.clearInput()

        expect(webview.postMessage).toHaveBeenCalled()
    })
})
