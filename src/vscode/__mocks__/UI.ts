export const on = jest.fn()
export const addReplInput = jest.fn()
export const addReplOutput = jest.fn()
export const clearReplHistory = jest.fn()
export const getHistoryItems = jest.fn()
export const getRestartIndex = jest.fn()
export const getUserInput = jest.fn()
export const init = jest.fn()
export const initAsdfSystemsTree = jest.fn()
export const initHistoryTree = jest.fn()
export const initInspector = jest.fn()
export const initPackagesTree = jest.fn()
export const initThreadsTree = jest.fn()
export const moveHistoryNodeToTop = jest.fn()
export const newInspector = jest.fn()
export const updatePackages = jest.fn()
export const refreshDiagnostics = jest.fn()
export const refreshInspectors = jest.fn()
export const registerProviders = jest.fn()
export const removeHistoryNode = jest.fn()
export const selectHistoryItem = jest.fn()
export const setQueryText = jest.fn()
export const setReplInput = jest.fn()
export const setReplPackage = jest.fn()
export const updateInspector = jest.fn()

export const UI = jest.fn(() => ({
    on,
    addReplInput,
    addReplOutput,
    clearReplHistory,
    getHistoryItems,
    getRestartIndex,
    getUserInput,
    init,
    initAsdfSystemsTree,
    initHistoryTree,
    initInspector,
    initPackagesTree,
    initThreadsTree,
    moveHistoryNodeToTop,
    newInspector,
    updatePackages,
    refreshDiagnostics,
    refreshInspectors,
    registerProviders,
    removeHistoryNode,
    selectHistoryItem,
    setQueryText,
    setReplInput,
    setReplPackage,
    updateInspector,
}))
