import { Position } from 'vscode'
import { AliveLspVersion, GitHubVersion, HistoryItem, InspectResult, Package, RestartInfo, SourceLocation, Thread } from './Types'
import { parseToInt } from './Utils'

export function isString(data: unknown): data is string {
    return typeof data === 'string'
}

export function isArray<T>(data: unknown, validate: (item: unknown) => item is T): data is Array<T> {
    return Array.isArray(data) && data.every(validate)
}

export function isBoolean(data: unknown): data is boolean {
    return typeof data === 'boolean'
}

export function isFiniteNumber(data: unknown): data is number {
    return Number.isFinite(data)
}

export function isObject(data: unknown): data is Record<string, unknown> {
    return typeof data === 'object' && data !== null && Object.keys(data).every(isString)
}

export function isPosition(item: unknown): item is Position {
    return isObject(item) && isFiniteNumber(item.line) && isFiniteNumber(item.character)
}

export function isSourceLocation(item: unknown): item is SourceLocation {
    return (
        isObject(item) &&
        isString(item.function) &&
        (item.file == null || isString(item.file)) &&
        (item.position == null || isPosition(item.position)) &&
        (item.vars == null || (isObject(item.vars) && Object.values(item.vars).every(isString)))
    )
}

export function isStackTrace(item: unknown): item is SourceLocation[] {
    return Array.isArray(item) && item.every(isSourceLocation)
}

export function isRestartInfo(item: unknown): item is RestartInfo {
    return isObject(item) && isString(item.name) && isString(item.description)
}

export function isInspectResult(data: unknown): data is InspectResult {
    return isObject(data) && Number.isFinite(parseToInt(data.id)) && data.result !== undefined && isString(data.resultType)
}

export function isHistoryItem(data: unknown): data is HistoryItem {
    return isObject(data) && isString(data.pkgName) && isString(data.text)
}

export function isThread(data: unknown): data is Thread {
    return isObject(data) && (isString(data.id) || data.id === null) && (isString(data.name) || data.name === null)
}

export function isPackage(data: unknown): data is Package {
    return isObject(data) && isString(data.name) && isArray(data.exports, isString) && isArray(data.nicknames, isString)
}

export function isGitHubVersion(data: unknown): data is GitHubVersion {
    return (
        isObject(data) &&
        isString(data.created_at) &&
        isString(data.name) &&
        isString(data.tag_name) &&
        isString(data.zipball_url)
    )
}

export function isAliveLspVersion(data: unknown): data is AliveLspVersion {
    return (
        isObject(data) &&
        isFiniteNumber(data.createdAt) &&
        isString(data.name) &&
        isString(data.tagName) &&
        isString(data.zipballUrl)
    )
}

export function isNodeSignal(signal: unknown): signal is NodeJS.Signals {
    switch (signal) {
        case 'SIGABRT':
        case 'SIGALRM':
        case 'SIGBUS':
        case 'SIGCHLD':
        case 'SIGCONT':
        case 'SIGFPE':
        case 'SIGHUP':
        case 'SIGILL':
        case 'SIGINT':
        case 'SIGIO':
        case 'SIGIOT':
        case 'SIGKILL':
        case 'SIGPIPE':
        case 'SIGPOLL':
        case 'SIGPROF':
        case 'SIGPWR':
        case 'SIGQUIT':
        case 'SIGSEGV':
        case 'SIGSTKFLT':
        case 'SIGSTOP':
        case 'SIGSYS':
        case 'SIGTERM':
        case 'SIGTRAP':
        case 'SIGTSTP':
        case 'SIGTTIN':
        case 'SIGTTOU':
        case 'SIGUNUSED':
        case 'SIGURG':
        case 'SIGUSR1':
        case 'SIGUSR2':
        case 'SIGVTALRM':
        case 'SIGWINCH':
        case 'SIGXCPU':
        case 'SIGXFSZ':
        case 'SIGBREAK':
        case 'SIGLOST':
        case 'SIGINFO':
            return true
        default:
            return false
    }
}
