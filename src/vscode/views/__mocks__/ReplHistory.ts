export const addItem = jest.fn()
export const removeItem = jest.fn()
export const decrementIndex = jest.fn()
export const incrementIndex = jest.fn()
export const getItems = jest.fn()
export const getCurrentItem = jest.fn()
export const moveToTop = jest.fn()
export const moveItemToTop = jest.fn()
export const removeNode = jest.fn()
export const update = jest.fn()
export const clear = jest.fn()
export const clearIndex = jest.fn()

export const HistoryNode = jest.fn()

export const ReplHistoryTreeProvider = jest.fn().mockImplementation(() => ({
    addItem,
    removeItem,
    removeNode,
    update,
    clear,
    clearIndex,
    incrementIndex,
    decrementIndex,
    getItems,
    getCurrentItem,
    moveToTop,
    moveItemToTop,
}))

export const ReplHistory = jest.fn().mockImplementation(() => ({
    HistoryNode,
    ReplHistoryTreeProvider,
}))
