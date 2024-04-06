export const doesPathExist = jest.fn(() => true)
export const getInstalledVersion = jest.fn()
export const getLatestVersion = jest.fn()
export const nukeInstalledVersion = jest.fn()
export const pullLatestVersion = jest.fn()

export const LspUtils = jest.fn(() => ({
    doesPathExist,
    getInstalledVersion,
    getLatestVersion,
    nukeInstalledVersion,
    pullLatestVersion,
}))
