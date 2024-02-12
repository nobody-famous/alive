export const update = jest.fn()

export const AsdfSystemsTreeProvider = jest.fn().mockImplementation(() => ({
    update,
}))

export const AsdfSystemsTree = jest.fn().mockImplementation(() => ({
    AsdfSystemsTreeProvider,
}))
