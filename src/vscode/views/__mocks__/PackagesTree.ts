export const update = jest.fn()

export const PackagesTreeProvider = jest.fn().mockImplementation(() => ({
    update,
}))

export const PackagesTree = jest.fn().mockImplementation(() => ({
    PackagesTreeProvider,
}))
