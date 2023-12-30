// Jest weirdness, this has to be before the import statements. Because... reasons...
const outChannel = { appendLine: jest.fn() }

import { log, toLog } from '../Log'

jest.mock('vscode', () => ({
    window: { createOutputChannel: () => outChannel },
}))

describe('Log tests', () => {
    it('log', () => {
        log('test message')
        expect(outChannel.appendLine).toHaveBeenCalledWith('test message')
    })

    it('toLog', () => {
        expect(toLog({})).toBe('{}')
        expect(toLog(5)).toBe('5')
    })
})
