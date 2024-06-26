export const createFolder = jest.fn()
export const diagnosticsEnabled = jest.fn()
export const getFolderPath = jest.fn()
export const getLspBasePath = jest.fn()
export const getWorkspaceOrFilePath = jest.fn()
export const hasValidLangId = jest.fn()
export const parseNote = jest.fn()
export const parsePos = jest.fn()
export const parseToInt = jest.fn()
export const startCompileTimer = jest.fn()
export const strToMarkdown = jest.fn()
export const tryCompile = jest.fn()
export const updateDiagnostics = jest.fn()
export const useEditor = jest.fn()

export const Utils = jest.fn().mockImplementation(() => ({
    createFolder,
    diagnosticsEnabled,
    getFolderPath,
    getLspBasePath,
    getWorkspaceOrFilePath,
    hasValidLangId,
    parseNote,
    parsePos,
    parseToInt,
    startCompileTimer,
    strToMarkdown,
    tryCompile,
    updateDiagnostics,
    useEditor,
}))
