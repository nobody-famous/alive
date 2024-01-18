export const update = jest.fn()

export const ThreadsTreeProvider = jest.fn().mockImplementation(() => ({
    update,
}))

export const ThreadsTree = jest.fn().mockImplementation(() => ({
    ThreadsTreeProvider,
}))
