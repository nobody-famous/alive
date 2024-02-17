export const LanguageClient = jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    onReady: jest.fn(),
    onNotification: jest.fn(),
    onRequest: jest.fn(),
}))
export class LanguageClientOptions {}
export class StreamInfo {}
