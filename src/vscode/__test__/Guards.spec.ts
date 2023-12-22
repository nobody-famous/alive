import { strictEqual } from 'assert'
import { isPosition } from '../Guards'

describe('Type guard tests', () => {
    it('isPosition', () => {
        strictEqual(false, isPosition(5))
    })

    it('isSourceLocation', () => {
        strictEqual(false, true)
    })
})
