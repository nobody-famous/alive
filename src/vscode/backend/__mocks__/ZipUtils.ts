export const getUnzippedPath = jest.fn()
export const readZipFile = jest.fn()
export const unzipFile = jest.fn()

export const ZipUtils = jest.fn(() => ({
    getUnzippedPath,
    readZipFile,
    unzipFile,
}))
