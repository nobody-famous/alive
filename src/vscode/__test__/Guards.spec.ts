import {
    isAliveLspVersion,
    isArray,
    isBoolean,
    isFiniteNumber,
    isGitHubVersion,
    isHistoryItem,
    isInspectResult,
    isNodeSignal,
    isObject,
    isPackage,
    isPosition,
    isRestartInfo,
    isSourceLocation,
    isStackTrace,
    isString,
    isThread,
} from '../Guards'

describe('Type guard tests', () => {
    it('isString', () => {
        expect(isString('')).toBe(true)
        expect(isString('foo')).toBe(true)
        expect(isString(5)).toBe(false)
        expect(isString({ foo: 'bar' })).toBe(false)
    })

    it('isArray', () => {
        expect(isArray([], isString)).toBe(true)
        expect(isArray([5], isString)).toBe(false)
    })

    it('isBoolean', () => {
        expect(isBoolean(true)).toBe(true)
        expect(isBoolean(5)).toBe(false)
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
        expect(isSourceLocation({ function: 'foo', file: 'bar' })).toBe(true)
        expect(isSourceLocation({ function: 'foo', position: { line: 5, character: 10 } })).toBe(true)
        expect(isSourceLocation({ file: 'bar', position: { line: 5, character: 10 } })).toBe(false)
        expect(isSourceLocation({ function: 'foo', vars: { foo: 10 } })).toBe(false)
        expect(isSourceLocation({ function: 'foo', vars: { foo: 'bar' } })).toBe(true)
        expect(isSourceLocation(5)).toBe(false)
        expect(isSourceLocation({ function: 10, file: 'bar' })).toBe(false)
    })

    it('isStackTrace', () => {
        expect(isStackTrace([{ function: 'foo', file: 'bar', position: { line: 5, character: 10 } }])).toBe(true)
        expect(isStackTrace([{ function: 'foo', file: null, position: { line: 5, character: 10 } }])).toBe(true)
        expect(isStackTrace([{ function: 'foo', file: 'bar', position: null }])).toBe(true)
        expect(isStackTrace([])).toBe(true)
        expect(isStackTrace([{ function: 'foo', file: 'bar' }])).toBe(true)
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

    it('isHistoryItem', () => {
        expect(isHistoryItem({ pkgName: 'foo', text: 'bar' })).toBe(true)
        expect(isHistoryItem({ pkgName: 'foo' })).toBe(false)
        expect(isHistoryItem({ text: 'bar' })).toBe(false)
        expect(isHistoryItem({ resultType: 'foo', result: 'bar' })).toBe(false)
    })

    it('isThread', () => {
        expect(isThread({ id: '10', name: 'foo' })).toBe(true)
        expect(isThread({ id: 10, name: 'foo' })).toBe(false)
        expect(isThread({ id: 'bar', name: 10 })).toBe(false)
    })

    it('isPackage', () => {
        expect(isPackage({ name: 'foo', exports: ['bar'], nicknames: ['baz'] })).toBe(true)
        expect(isPackage({ name: 'foo', exports: ['bar'], nicknames: [10] })).toBe(false)
        expect(isPackage({ id: 'bar', name: 10 })).toBe(false)
    })

    it('isGitHubVersion', () => {
        expect(isGitHubVersion({ created_at: 'time', name: 'foo', tag_name: 'bar', zipball_url: 'url' })).toBe(true)
        expect(isGitHubVersion({ created_at: 5, name: 'foo', tag_name: 'bar', zipball_url: 'url' })).toBe(false)
        expect(isGitHubVersion({ created_at: 'time', name: 10, tag_name: 'bar', zipball_url: 'url' })).toBe(false)
        expect(isGitHubVersion({ created_at: 'time', name: 'foo', tag_name: 15, zipball_url: 'url' })).toBe(false)
        expect(isGitHubVersion({ created_at: 'time', name: 'foo', tag_name: 'bar', zipball_url: 20 })).toBe(false)
        expect(isGitHubVersion({})).toBe(false)
    })

    it('isAliveLspVersion', () => {
        expect(isAliveLspVersion({ createdAt: 5, name: 'foo', tagName: 'bar', zipballUrl: 'url' })).toBe(true)
        expect(isAliveLspVersion({ createdAt: 'foo', name: 'foo', tagName: 'bar', zipballUrl: 'url' })).toBe(false)
        expect(isAliveLspVersion({ createdAt: 5, name: 10, tagName: 'bar', zipballUrl: 'url' })).toBe(false)
        expect(isAliveLspVersion({ createdAt: 5, name: 'foo', tagName: 15, zipballUrl: 'url' })).toBe(false)
        expect(isAliveLspVersion({ createdAt: 5, name: 'foo', tagName: 'bar', zipballUrl: 20 })).toBe(false)
        expect(isAliveLspVersion({})).toBe(false)
    })

    it('isNodeSignal', () => {
        expect(isNodeSignal('SIGABRT')).toBe(true)
        expect(isNodeSignal('SIGALRM')).toBe(true)
        expect(isNodeSignal('SIGBUS')).toBe(true)
        expect(isNodeSignal('SIGCHLD')).toBe(true)
        expect(isNodeSignal('SIGCONT')).toBe(true)
        expect(isNodeSignal('SIGFPE')).toBe(true)
        expect(isNodeSignal('SIGHUP')).toBe(true)
        expect(isNodeSignal('SIGILL')).toBe(true)
        expect(isNodeSignal('SIGINT')).toBe(true)
        expect(isNodeSignal('SIGIO')).toBe(true)
        expect(isNodeSignal('SIGIOT')).toBe(true)
        expect(isNodeSignal('SIGKILL')).toBe(true)
        expect(isNodeSignal('SIGPIPE')).toBe(true)
        expect(isNodeSignal('SIGPOLL')).toBe(true)
        expect(isNodeSignal('SIGPROF')).toBe(true)
        expect(isNodeSignal('SIGPWR')).toBe(true)
        expect(isNodeSignal('SIGQUIT')).toBe(true)
        expect(isNodeSignal('SIGSEGV')).toBe(true)
        expect(isNodeSignal('SIGSTKFLT')).toBe(true)
        expect(isNodeSignal('SIGSTOP')).toBe(true)
        expect(isNodeSignal('SIGSYS')).toBe(true)
        expect(isNodeSignal('SIGTERM')).toBe(true)
        expect(isNodeSignal('SIGTRAP')).toBe(true)
        expect(isNodeSignal('SIGTSTP')).toBe(true)
        expect(isNodeSignal('SIGTTIN')).toBe(true)
        expect(isNodeSignal('SIGTTOU')).toBe(true)
        expect(isNodeSignal('SIGUNUSED')).toBe(true)
        expect(isNodeSignal('SIGURG')).toBe(true)
        expect(isNodeSignal('SIGUSR1')).toBe(true)
        expect(isNodeSignal('SIGUSR2')).toBe(true)
        expect(isNodeSignal('SIGVTALRM')).toBe(true)
        expect(isNodeSignal('SIGWINCH')).toBe(true)
        expect(isNodeSignal('SIGXCPU')).toBe(true)
        expect(isNodeSignal('SIGXFSZ')).toBe(true)
        expect(isNodeSignal('SIGBREAK')).toBe(true)
        expect(isNodeSignal('SIGLOST')).toBe(true)
        expect(isNodeSignal('SIGINFO')).toBe(true)

        expect(isNodeSignal('FOO')).toBe(false)
        expect(isNodeSignal({ foo: 'bar' })).toBe(false)
    })
})
