export const update = jest.fn()

export const TracedFunctionTreeProvider = jest.fn().mockImplementation(() => ({
    update,
}))

export const TracedFunctionsTree = jest.fn().mockImplementation(() => ({
    TracedFunctionTreeProvider,
}))
