export const on = jest.fn()
export const addReplText = jest.fn()
export const clearReplHistory = jest.fn()
export const getHistoryItems = jest.fn()
export const init = jest.fn()
export const initAsdfSystemsTree = jest.fn()
export const initHistoryTree = jest.fn()
export const initInspector = jest.fn()
export const initPackagesTree = jest.fn()
export const initThreadsTree = jest.fn()
export const moveHistoryNodeToTop = jest.fn()
export const registerProviders = jest.fn()
export const removeHistoryNode = jest.fn()
export const selectHistoryItem = jest.fn()
export const setReplInput = jest.fn()
export const setReplPackage = jest.fn()

export const UI = jest.fn().mockImplementation(() => ({
    on,
    addReplText,
    clearReplHistory,
    getHistoryItems,
    init,
    initAsdfSystemsTree,
    initHistoryTree,
    initInspector,
    initPackagesTree,
    initThreadsTree,
    moveHistoryNodeToTop,
    registerProviders,
    removeHistoryNode,
    selectHistoryItem,
    setReplInput,
    setReplPackage,
}))
