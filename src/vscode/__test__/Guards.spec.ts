import { strictEqual } from 'assert'
import { isFiniteNumber, isObject, isPosition, isSourceLocation, isString } from '../Guards'

describe('Type guard tests', () => {
    it('isString', () => {
        strictEqual(true, isString(''))
        strictEqual(true, isString('foo'))
        strictEqual(false, isString(5))
        strictEqual(false, isString({ foo: 'bar' }))
    })

    it('isFiniteNumber', () => {
        strictEqual(true, isFiniteNumber(5))
        strictEqual(true, isFiniteNumber(1e9))
        strictEqual(false, isFiniteNumber(NaN))
        strictEqual(false, isFiniteNumber(1e1000))
        strictEqual(false, isFiniteNumber('foo'))
    })

    it('isObject', () => {
        strictEqual(true, isObject({}))
        strictEqual(true, isObject({ foo: 'bar' }))
        strictEqual(false, isObject(NaN))
        strictEqual(false, isObject(1e1000))
        strictEqual(false, isObject('foo'))
    })

    it('isPosition', () => {
        strictEqual(true, isPosition({ line: 5, character: 10 }))
        strictEqual(false, isPosition({ line: 'foo', character: 10 }))
        strictEqual(false, isPosition({ line: 5, character: 'bar' }))
        strictEqual(false, isPosition(5))
    })

    it('isSourceLocation', () => {
        strictEqual(true, isSourceLocation({ function: 'foo', file: 'bar', position: { line: 5, character: 10 } }))
        strictEqual(false, isSourceLocation({ function: 'foo', file: 'bar' }))
        strictEqual(false, isSourceLocation({ function: 'foo', position: { line: 5, character: 10 } }))
        strictEqual(false, isSourceLocation({ file: 'bar', position: { line: 5, character: 10 } }))
    })
})
