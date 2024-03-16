export const isArray = jest.fn(() => true)
export const isInspectResult = jest.fn(() => true)
export const isObject = jest.fn(() => true)
export const isPackage = jest.fn(() => true)
export const isRestartInfo = jest.fn(() => true)
export const isStackTrace = jest.fn(() => true)
export const isString = jest.fn(() => true)
export const isThread = jest.fn(() => true)

export const Guards = jest.fn(() => ({
    isArray,
    isInspectResult,
    isObject,
    isPackage,
    isRestartInfo,
    isStackTrace,
    isString,
    isThread,
}))
