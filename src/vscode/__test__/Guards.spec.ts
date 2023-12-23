import { strictEqual } from 'assert'
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
        strictEqual(isString(''), true)
        strictEqual(isString('foo'), true)
        strictEqual(isString(5), false)
        strictEqual(isString({ foo: 'bar' }), false)
    })

    it('isFiniteNumber', () => {
        strictEqual(isFiniteNumber(5), true)
        strictEqual(isFiniteNumber(1e9), true)
        strictEqual(isFiniteNumber(NaN), false)
        strictEqual(isFiniteNumber(1e1000), false)
        strictEqual(isFiniteNumber('foo'), false)
    })

    it('isObject', () => {
        strictEqual(isObject({}), true)
        strictEqual(isObject({ foo: 'bar' }), true)
        strictEqual(isObject(NaN), false)
        strictEqual(isObject(1e1000), false)
        strictEqual(isObject('foo'), false)
    })

    it('isPosition', () => {
        strictEqual(isPosition({ line: 5, character: 10 }), true)
        strictEqual(isPosition({ line: 'foo', character: 10 }), false)
        strictEqual(isPosition({ line: 5, character: 'bar' }), false)
        strictEqual(isPosition(5), false)
    })

    it('isSourceLocation', () => {
        strictEqual(isSourceLocation({ function: 'foo', file: 'bar', position: { line: 5, character: 10 } }), true)
        strictEqual(isSourceLocation({ function: 'foo', file: 'bar' }), false)
        strictEqual(isSourceLocation({ function: 'foo', position: { line: 5, character: 10 } }), false)
        strictEqual(isSourceLocation({ file: 'bar', position: { line: 5, character: 10 } }), false)
    })

    it('isStackTrace', () => {
        strictEqual(isStackTrace([{ function: 'foo', file: 'bar', position: { line: 5, character: 10 } }]), true)
        strictEqual(isStackTrace([]), true)
        strictEqual(isStackTrace([{ function: 'foo', file: 'bar' }]), false)
        strictEqual(isStackTrace({ file: 'bar', position: { line: 5, character: 10 } }), false)
    })

    it('isRestartInfo', () => {
        strictEqual(isRestartInfo({ name: 'foo', description: 'bar' }), true)
        strictEqual(isRestartInfo({ name: 'foo' }), false)
        strictEqual(isRestartInfo({ description: 'bar' }), false)
        strictEqual(isRestartInfo(5), false)
    })

    it('isInspectResult', () => {
        strictEqual(isInspectResult({ id: 5, resultType: 'foo', result: 'bar' }), true)
        strictEqual(isInspectResult({ id: '5.9', resultType: 'foo', result: 'bar' }), false)
        strictEqual(isInspectResult({ id: 5.9, resultType: 'foo', result: 'bar' }), false)
        strictEqual(isInspectResult({ id: 5, resultType: 10, result: 'bar' }), false)
        strictEqual(isInspectResult({ id: 5, result: 'bar' }), false)
        strictEqual(isInspectResult({ id: 5, resultType: 'foo' }), false)
        strictEqual(isInspectResult({ resultType: 'foo', result: 'bar' }), false)
    })
})
