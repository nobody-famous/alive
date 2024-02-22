export const diagnosticsEnabled = jest.fn()
export const getWorkspaceOrFilePath = jest.fn()
export const hasValidLangId = jest.fn()
export const parseToInt = jest.fn()
export const startCompileTimer = jest.fn()
export const strToMarkdown = jest.fn()
export const tryCompile = jest.fn()
export const updateDiagnostics = jest.fn()

export const Utils = jest.fn().mockImplementation(() => ({
    diagnosticsEnabled,
    getWorkspaceOrFilePath,
    hasValidLangId,
    parseToInt,
    startCompileTimer,
    strToMarkdown,
    tryCompile,
    updateDiagnostics,
}))
