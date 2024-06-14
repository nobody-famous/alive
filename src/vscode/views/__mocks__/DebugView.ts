export const debugOn = jest.fn()
export const debugRun = jest.fn()
export const debugSelectRestart = jest.fn()
export const debugStop = jest.fn()
export const debugPanel = { visible: false }

export const fake = {
    on: debugOn,
    run: debugRun,
    selectRestart: debugSelectRestart,
    stop: debugStop,
    panel: debugPanel,
}

export const DebugView = jest.fn().mockImplementation(() => fake)
