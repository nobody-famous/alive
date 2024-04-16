import { clearInlineResults } from '..'

describe('index tests', () => {
    it('clearInlineResults', () => {
        const state = { hoverText: 'foo' }

        clearInlineResults(state)
        expect(state.hoverText).toBe('')
    })
})
