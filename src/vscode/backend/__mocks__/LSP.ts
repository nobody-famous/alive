export const on = jest.fn()
export const connect = jest.fn()
export const editorChanged = jest.fn()
export const evalFn = jest.fn()
export const listAsdfSystems = jest.fn()
export const listPackages = jest.fn()
export const listThreads = jest.fn()
export const textDocumentChanged = jest.fn()

export const LSP = jest.fn().mockImplementation(() => ({
    on,
    connect,
    editorChanged,
    eval: evalFn,
    listAsdfSystems,
    listPackages,
    listThreads,
    textDocumentChanged,
}))
