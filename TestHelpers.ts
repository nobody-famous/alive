export const getCallback = async (
    toMock: jest.Mock,
    mockCount: number,
    initFn: () => Promise<void>,
    name: string
): Promise<((...args: unknown[]) => void) | undefined> => {
    const fns = await getAllCallbacks(toMock, mockCount, initFn)

    return fns[name]
}

export const getAllCallbacks = async (
    toMock: jest.Mock,
    mockCount: number,
    initFn: () => Promise<void>
): Promise<{ [index: string]: (...args: unknown[]) => void | Promise<void> }> => {
    const callbacks: { [index: string]: (...args: unknown[]) => void } = {}
    const onFn = (label: string, fn: (...args: unknown[]) => void) => {
        callbacks[label] = fn
    }

    for (let count = 0; count < mockCount; count++) {
        toMock.mockImplementationOnce(onFn)
    }

    await initFn()

    return callbacks
}
