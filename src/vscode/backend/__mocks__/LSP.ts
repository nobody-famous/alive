export const on = jest.fn()
export const connect = jest.fn()
export const listAsdfSystems = jest.fn()
export const listPackages = jest.fn()
export const listThreads = jest.fn()

export const LSP = jest.fn().mockImplementation(() => ({
    on,
    connect,
    listAsdfSystems,
    listPackages,
    listThreads,
}))
