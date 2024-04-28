import { InspectorPanel } from '../InspectorPanel'
import { createFakeWebview } from './utils'

describe('InspectorPanel tests', () => {
    const fakeContext = { subscriptions: [], extensionPath: '/some/path' }

    it('resolveWebviewView', () => {
        const panel = new InspectorPanel(fakeContext)

        panel.resolveWebviewView({ webview: createFakeWebview() })
    })

    describe('setPackage', () => {
        it('No view', () => {
            const panel = new InspectorPanel(fakeContext)

            panel.setPackage('Some package')
        })

        it('With view', () => {
            const panel = new InspectorPanel(fakeContext)
            const view = createFakeWebview()

            panel.resolveWebviewView({ webview: view })
            panel.setPackage('Some package')

            expect(view.postMessage).toHaveBeenCalled()
        })
    })

    describe('Messages', () => {
        const getPanel = (msg: { command: string; text?: string }) => {
            const panel = new InspectorPanel(fakeContext)
            const view = createFakeWebview()
            let cb: ((msg: { command: string; text?: string }) => void) | undefined

            view.onDidReceiveMessage.mockImplementationOnce((fn) => {
                cb = fn
            })

            panel.emit = jest.fn()
            panel.resolveWebviewView({ webview: view })

            cb?.(msg)

            return panel
        }

        it('eval', () => {
            const panel = getPanel({ command: 'eval', text: 'bar' })

            expect(panel.emit).toHaveBeenCalledWith('inspect', 'cl-user', 'bar')
        })

        it('eval no text', () => {
            const panel = getPanel({ command: 'eval' })

            expect(panel.emit).toHaveBeenCalledWith('inspect', 'cl-user', '')
        })

        it('requestPackage', () => {
            const panel = getPanel({ command: 'requestPackage', text: 'bar' })

            expect(panel.emit).toHaveBeenCalled()
        })
    })
})
