export const languages = {
    createDiagnosticCollection: jest.fn(),
}

export const window = {
    createOutputChannel: () => ({ appendLine: () => {} }),
}

export const workspace = {
    workspaceFolders: [],
}
