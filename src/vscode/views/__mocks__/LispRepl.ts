export const replOn = jest.fn()
export const replOff = jest.fn()
export const replClear = jest.fn()
export const replClearInput = jest.fn()
export const replAddText = jest.fn()
export const replSetPackage = jest.fn()
export const replSetInput = jest.fn()
export const replGetUserInput = jest.fn()

export const LispRepl = jest.fn().mockImplementation(() => ({
    on: replOn,
    off: replOff,
    clear: replClear,
    clearInput: replClearInput,
    addText: replAddText,
    setPackage: replSetPackage,
    setInput: replSetInput,
    getUserInput: replGetUserInput,
}))
