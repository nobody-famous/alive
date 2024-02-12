export const inspectorOn = jest.fn()
export const inspectorShow = jest.fn()
export const inspectorUpdate = jest.fn()

export const Inspector = jest.fn().mockImplementation(() => ({
    on: inspectorOn,
    show: inspectorShow,
    update: inspectorUpdate,
}))
