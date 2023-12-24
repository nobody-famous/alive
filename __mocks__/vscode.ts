export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export const languages = {
    createDiagnosticCollection: jest.fn(),
}

export const window = {
    createOutputChannel: () => ({ appendLine: () => {} }),
}

export const workspace = {
    workspaceFolders: [],
}
