export const createPanel = () => ({
    dispose: jest.fn(),
    onDidDispose: jest.fn(),
    onDidChangeViewState: jest.fn(),
    webview: {
        html: '',
        asWebviewUri: jest.fn(),
        onDidReceiveMessage: jest.fn(),
    },
})
