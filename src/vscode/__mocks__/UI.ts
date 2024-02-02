export const on = jest.fn()
export const clearReplHistory = jest.fn()
export const getHistoryItems = jest.fn()
export const init = jest.fn()
export const initAsdfSystemsTree = jest.fn()
export const initHistoryTree = jest.fn()
export const initInspector = jest.fn()
export const initPackagesTree = jest.fn()
export const initThreadsTree = jest.fn()
export const registerProviders = jest.fn()
export const selectHistoryItem = jest.fn()

export const UI = jest.fn().mockImplementation(() => ({
    on,
    clearReplHistory,
    getHistoryItems,
    init,
    initAsdfSystemsTree,
    initHistoryTree,
    initInspector,
    initPackagesTree,
    initThreadsTree,
    registerProviders,
    selectHistoryItem,
}))
