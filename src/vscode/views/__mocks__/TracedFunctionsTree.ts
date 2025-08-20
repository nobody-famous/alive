export const listPackages = jest.fn()
export const update = jest.fn()

export const TracedFunctionTreeProvider = jest.fn().mockImplementation(() => ({
    listPackages,
    update,
}))

export const TracedFunctionsTree = jest.fn().mockImplementation(() => ({
    TracedFunctionTreeProvider,
}))
