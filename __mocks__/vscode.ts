export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export enum ViewColumn {
    Two = 2,
}

export const languages = {
    createDiagnosticCollection: jest.fn(),
    registerHoverProvider: jest.fn(),
}

export const window = {
    createOutputChannel: () => ({ appendLine: () => {} }),
    createQuickPick: jest.fn(),
    showQuickPick: jest.fn(),
    showErrorMessage: jest.fn(),
    showTextDocument: jest.fn(),
    onDidChangeActiveTextEditor: jest.fn(),
    registerWebviewViewProvider: jest.fn(),
    registerTreeDataProvider: jest.fn(),
}

export const workspace = {
    workspaceFolders: [],
    openTextDocument: jest.fn(),
    onDidOpenTextDocument: jest.fn(),
    onDidChangeTextDocument: jest.fn(),
}

export const commands = {
    executeCommand: jest.fn(),
    registerCommand: jest.fn(),
}

export class Position {}
export class Range {}
export class Selection {}
