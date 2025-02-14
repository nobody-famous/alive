export const getCallback = async (
    toMock: jest.Mock,
    initFn: () => Promise<void>,
    name: string
): Promise<((...args: unknown[]) => Promise<void>) | undefined> => {
    const fns = await getAllCallbacks(toMock, initFn)

    return fns[name]
}

export const getAllCallbacks = async (
    toMock: jest.Mock,
    initFn: () => Promise<void>
): Promise<{ [index: string]: (...args: unknown[]) => Promise<void> }> => {
    const callbacks: { [index: string]: (...args: unknown[]) => Promise<void> } = {}
    const onFn = (label: string, fn: (...args: unknown[]) => Promise<void>) => {
        callbacks[label] = fn
    }

    toMock.mockImplementation(onFn)

    await initFn()

    return callbacks
}
