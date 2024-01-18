export const debugOn = jest.fn()
export const debugRun = jest.fn()
export const debugStop = jest.fn()

export const DebugView = jest.fn().mockImplementation(() => ({
    on: debugOn,
    run: debugRun,
    stop: debugStop,
}))
