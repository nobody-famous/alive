import { InspectorPanel } from '../InspectorPanel'

describe('InspectorPanel tests', () => {
    const createFakeWebview = () => ({
        options: {},
        html: '',
        onDidReceiveMessage: jest.fn(),
        postMessage: jest.fn(),
        asWebviewUri: jest.fn(),
        cspSource: '',
    })

    it('resolveWebviewView', () => {
        const panel = new InspectorPanel({ subscriptions: [], extensionPath: '/some/path' })

        panel.resolveWebviewView({ webview: createFakeWebview() })
    })

    describe('setPackage', () => {
        it('No view', () => {
            const panel = new InspectorPanel({ subscriptions: [], extensionPath: '/some/path' })

            panel.setPackage('Some package')
        })

        it('With view', () => {
            const panel = new InspectorPanel({ subscriptions: [], extensionPath: '/some/path' })
            const view = createFakeWebview()

            panel.resolveWebviewView({ webview: view })
            panel.setPackage('Some package')

            expect(view.postMessage).toHaveBeenCalled()
        })
    })

    describe('Messages', () => {
        it('', () => {
            const panel = new InspectorPanel({ subscriptions: [], extensionPath: '/some/path' })
            const view = createFakeWebview()
            let cb: ((msg: { command: string; text: string }) => void) | undefined

            view.onDidReceiveMessage.mockImplementationOnce((fn) => {
                cb = fn
            })

            panel.resolveWebviewView({ webview: view })

            cb?.({ command: 'foo', text: 'bar' })
        })
    })
})
