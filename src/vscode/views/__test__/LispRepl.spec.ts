import { LispRepl } from '../LispRepl'
import { createFakeWebview } from './utils'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

jest.useFakeTimers()

describe('LispRepl tests', () => {
    const fakeContext = { subscriptions: [], extensionPath: '/some/path' }
    const extension = vscodeMock.extensions.getExtension()

    const createRepl = () => {
        const repl = new LispRepl(fakeContext, extension)
        const webview = createFakeWebview()
        let cb: ((msg: { command: string; text?: string }) => void) | undefined

        webview.onDidReceiveMessage.mockImplementationOnce((fn) => {
            cb = fn
        })
        repl.resolveWebviewView({ webview, onDidChangeVisibility: jest.fn() })

        return { repl, webview, cb }
    }

    it('changeVisibility', () => {
        const { cb, repl } = createRepl()
        const webview = createFakeWebview()
        let fn: (() => void) | undefined

        repl.resolveWebviewView({
            webview,
            onDidChangeVisibility: (f) => {
                fn = f
                return { dispose: jest.fn() }
            },
        })

        cb?.({ command: 'webviewReady' })

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
            const repl = new LispRepl(fakeContext, extension)

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
            const repl = new LispRepl(fakeContext, extension)

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
            const repl = new LispRepl(fakeContext, extension)

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
            const repl = new LispRepl(fakeContext, extension)

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
            const repl = new LispRepl(fakeContext, extension)

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

    describe('clear', () => {
        it('should clear REPL output and notify webview', () => {
            const { repl, webview } = createRepl()

            repl.addOutput('test output')
            repl.addInput('test input', 'cl-user')

            repl.clear()

            expect(webview.postMessage).toHaveBeenCalledWith({
                type: 'clear',
            })

            repl.restoreState()
            expect(webview.postMessage).toHaveBeenLastCalledWith({
                type: 'clear',
            })
        })
    
        it('should clear REPL output and skip webview notification when view is undefined', () => {
            const { repl, webview } = createRepl()
    
            repl.view = undefined;
            repl.addOutput('test output')
            repl.addInput('test input', 'cl-user')
    
            repl.clear()
    
            expect(webview.postMessage).not.toHaveBeenCalled()
        })
    })

    describe('restoreState', () => {
        it('should not restore state if webview is not ready', () => {
            const { repl, webview } = createRepl()
            
            jest.clearAllMocks()
            repl.restoreState()
            
            expect(webview.postMessage).not.toHaveBeenCalled()
        })

        it('should restore state when webview is ready', () => {
            const { repl, webview, cb } = createRepl()
            
            jest.clearAllMocks()
            
            cb?.({ command: 'webviewReady' })
            
            repl.restoreState()
            
            expect(webview.postMessage).toHaveBeenCalledWith({
                type: 'setPackage',
                name: 'cl-user',
            })
            expect(webview.postMessage).toHaveBeenCalledWith({
                type: 'restoreState',
                items: [],
                hasBeenCleared: false,
            })
        })

        it('should handle undefined view', () => {
            const { repl, webview, cb } = createRepl()
            
            cb?.({ command: 'webviewReady' })
            
            Object.defineProperty(repl, 'view', { value: undefined })
            
            expect(() => repl.restoreState()).not.toThrow()
        })
    })

    describe('getUserInput', () => {
        it('should request user input from webview', () => {
            const { repl, webview } = createRepl()

            repl.getUserInput()

            expect(webview.postMessage).toHaveBeenCalledWith({
                type: 'getUserInput',
            })
        })
    })

    describe('addInput', () => {
        it('should add input with package name when view exists', () => {
            const { repl, webview } = createRepl()
            
            repl.addInput('test input', 'cl-user')
            
            expect(webview.postMessage).toHaveBeenCalledWith({
                type: 'appendOutput',
                obj: {
                    type: 'input',
                    pkgName: 'cl-user',
                    text: 'test input'
                }
            })
        })

        it('should handle undefined view', () => {
            const repl = new LispRepl(fakeContext, extension)
            
            expect(() => repl.addInput('test input', 'cl-user')).not.toThrow()
        })
    })

    describe('getWebviewContent', () => {
        it('should handle undefined version', () => {
            const { repl, webview } = createRepl()
            
            repl.resolveWebviewView({ webview, onDidChangeVisibility: jest.fn() })
            
            expect(webview.html).toContain('data-extension-version="0.1"')
        })

        it('should handle missing version in package.json', () => {
            const extensionWithoutVersion = { ...extension }
            delete extensionWithoutVersion.packageJSON.version
            
            const repl = new LispRepl(fakeContext, extensionWithoutVersion)
            const webview = createFakeWebview()
            
            repl.resolveWebviewView({ webview, onDidChangeVisibility: jest.fn() })
            
            expect(webview.html).toContain('data-extension-version=""')
        })
    })
})
