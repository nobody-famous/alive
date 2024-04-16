export const on = jest.fn()
export const connect = jest.fn()
export const editorChanged = jest.fn()
export const evalFn = jest.fn()
export const evalWithOutput = jest.fn()
export const inspect = jest.fn()
export const inspectClosed = jest.fn()
export const inspectEval = jest.fn()
export const inspectRefresh = jest.fn()
export const inspectRefreshMacro = jest.fn()
export const inspectMacroInc = jest.fn()
export const killThread = jest.fn()
export const listAsdfSystems = jest.fn()
export const listPackages = jest.fn()
export const listThreads = jest.fn()
export const loadAsdfSystem = jest.fn()
export const removeExport = jest.fn()
export const removePackage = jest.fn()
export const textDocumentChanged = jest.fn()

export const LSP = jest.fn(() => ({
    on,
    connect,
    editorChanged,
    eval: evalFn,
    evalWithOutput,
    inspect,
    inspectClosed,
    inspectEval,
    inspectRefresh,
    inspectRefreshMacro,
    inspectMacroInc,
    killThread,
    listAsdfSystems,
    listPackages,
    listThreads,
    loadAsdfSystem,
    removeExport,
    removePackage,
    textDocumentChanged,
}))
