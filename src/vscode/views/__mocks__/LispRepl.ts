export const replOn = jest.fn()
export const replOff = jest.fn()
export const replClear = jest.fn()
export const replToggleWordWrap = jest.fn()
export const replClearInput = jest.fn()
export const replAddOutputText = jest.fn()
export const replAddInputText = jest.fn()
export const replSetPackage = jest.fn()
export const replSetInput = jest.fn()
export const replGetUserInput = jest.fn()

export const LispRepl = jest.fn().mockImplementation(() => ({
    on: replOn,
    off: replOff,
    clear: replClear,
    toggleWordWrap: replToggleWordWrap,
    clearInput: replClearInput,
    addInput: replAddInputText,
    addOutput: replAddOutputText,
    setPackage: replSetPackage,
    setInput: replSetInput,
    getUserInput: replGetUserInput,
}))
