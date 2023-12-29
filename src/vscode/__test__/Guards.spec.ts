import {
    isFiniteNumber,
    isInspectResult,
    isObject,
    isPosition,
    isRestartInfo,
    isSourceLocation,
    isStackTrace,
    isString,
} from '../Guards'

describe('Type guard tests', () => {
    it('isString', () => {
        expect(isString('')).toBe(true)
        expect(isString('foo')).toBe(true)
        expect(isString(5)).toBe(false)
        expect(isString({ foo: 'bar' })).toBe(false)
    })

    it('isFiniteNumber', () => {
        expect(isFiniteNumber(5)).toBe(true)
        expect(isFiniteNumber(1e9)).toBe(true)
        expect(isFiniteNumber(NaN)).toBe(false)
        expect(isFiniteNumber('foo')).toBe(false)
    })

    it('isObject', () => {
        expect(isObject({})).toBe(true)
        expect(isObject({ foo: 'bar' })).toBe(true)
        expect(isObject(NaN)).toBe(false)
        expect(isObject('foo')).toBe(false)
    })

    it('isPosition', () => {
        expect(isPosition({ line: 5, character: 10 })).toBe(true)
        expect(isPosition({ line: 'foo', character: 10 })).toBe(false)
        expect(isPosition({ line: 5, character: 'bar' })).toBe(false)
        expect(isPosition(5)).toBe(false)
    })

    it('isSourceLocation', () => {
        expect(isSourceLocation({ function: 'foo', file: 'bar', position: { line: 5, character: 10 } })).toBe(true)
        expect(isSourceLocation({ function: 'foo', file: 'bar' })).toBe(false)
        expect(isSourceLocation({ function: 'foo', position: { line: 5, character: 10 } })).toBe(false)
        expect(isSourceLocation({ file: 'bar', position: { line: 5, character: 10 } })).toBe(false)
    })

    it('isStackTrace', () => {
        expect(isStackTrace([{ function: 'foo', file: 'bar', position: { line: 5, character: 10 } }])).toBe(true)
        expect(isStackTrace([{ function: 'foo', file: null, position: { line: 5, character: 10 } }])).toBe(true)
        expect(isStackTrace([{ function: 'foo', file: 'bar', position: null }])).toBe(true)
        expect(isStackTrace([])).toBe(true)
        expect(isStackTrace([{ function: 'foo', file: 'bar' }])).toBe(false)
        expect(isStackTrace({ file: 'bar', position: { line: 5, character: 10 } })).toBe(false)
    })

    it('isRestartInfo', () => {
        expect(isRestartInfo({ name: 'foo', description: 'bar' })).toBe(true)
        expect(isRestartInfo({ name: 'foo' })).toBe(false)
        expect(isRestartInfo({ description: 'bar' })).toBe(false)
        expect(isRestartInfo(5)).toBe(false)
    })

    it('isInspectResult', () => {
        expect(isInspectResult({ id: 5, resultType: 'foo', result: 'bar' })).toBe(true)
        expect(isInspectResult({ id: '5.9', resultType: 'foo', result: 'bar' })).toBe(false)
        expect(isInspectResult({ id: 5.9, resultType: 'foo', result: 'bar' })).toBe(false)
        expect(isInspectResult({ id: 5, resultType: 10, result: 'bar' })).toBe(false)
        expect(isInspectResult({ id: 5, result: 'bar' })).toBe(false)
        expect(isInspectResult({ id: 5, resultType: 'foo' })).toBe(false)
        expect(isInspectResult({ resultType: 'foo', result: 'bar' })).toBe(false)
    })
})
