export const createPath = jest.fn()
export const doesPathExist = jest.fn(() => true)
export const getInstalledVersion = jest.fn()
export const getLatestVersion = jest.fn()
export const nukeInstalledVersion = jest.fn()
export const pullLatestVersion = jest.fn()

export const LspUtils = jest.fn(() => ({
    createPath,
    doesPathExist,
    getInstalledVersion,
    getLatestVersion,
    nukeInstalledVersion,
    pullLatestVersion,
}))
