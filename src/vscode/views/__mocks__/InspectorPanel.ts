export const inspectPanelOn = jest.fn()

export const InspectorPanel = jest.fn().mockImplementation(() => ({
    on: inspectPanelOn,
}))
