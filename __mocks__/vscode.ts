export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export enum ViewColumn {
    Two = 2,
}

export enum TreeItemCollapsibleState {
    None = 0,
}

export class Uri {
    static file = jest.fn()
}

export const languages = {
    createDiagnosticCollection: jest.fn(),
    registerHoverProvider: jest.fn(),
}

export const window = {
    createOutputChannel: () => ({ appendLine: () => {}, append: () => {}, show: () => {} }),
    createQuickPick: jest.fn(),
    createWebviewPanel: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showTextDocument: jest.fn(),
    onDidChangeActiveTextEditor: jest.fn(),
    registerWebviewViewProvider: jest.fn(),
    registerTreeDataProvider: jest.fn(),
}

export const workspace = {
    fs: {
        createDirectory: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
    },

    workspaceFolders: [],
    openTextDocument: jest.fn(),
    onDidOpenTextDocument: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
    onDidChangeTextDocument: jest.fn(),
    getConfiguration: jest.fn(),
    saveAll: jest.fn(),
}

export const commands = {
    executeCommand: jest.fn(),
    registerCommand: jest.fn(),
}

export const extensions = {
    getExtension: jest.fn(() => ({ extensionPath: 'some path' })),
}

export class Hover {
    contents: MarkdownString[] = []

    constructor(contents: MarkdownString) {
        this.contents.push(contents)
    }
}

export class MarkdownString {
    value: string

    constructor(value: string) {
        this.value = value
    }
}

export class EventEmitter {
    fn = jest.fn()
    event = jest.fn((fn) => {
        this.fn = fn
    })
    fire = jest.fn(() => this.fn())
}

export class TreeItem {
    label: string

    constructor(label: string) {
        this.label = label
    }
}

export class Position {}
export class Range {}
export class Selection {}
export class Diagnostic {}
