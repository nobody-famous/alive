export const on = jest.fn()
export const init = jest.fn()
export const initHistoryTree = jest.fn()
export const initInspector = jest.fn()
export const registerProviders = jest.fn()

export const UI = jest.fn().mockImplementation(() => ({
    on,
    init,
    initHistoryTree,
    initInspector,
    registerProviders,
}))
