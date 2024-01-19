export const getWorkspaceOrFilePath = jest.fn()
export const tryCompile = jest.fn()
export const updateDiagnostics = jest.fn()

export const Utils = jest.fn().mockImplementation(() => ({
    getWorkspaceOrFilePath,
    tryCompile,
    updateDiagnostics,
}))
