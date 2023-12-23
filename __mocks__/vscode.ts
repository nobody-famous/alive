export const languages = {
    createDiagnosticCollection: jest.fn(),
}

export const window = {
    createOutputChannel: jest.fn(),
}

export const vscode = {
    languages,
    window,
}
