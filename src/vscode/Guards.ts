import { Position } from 'vscode'
import { HistoryItem, InspectResult, Package, RestartInfo, SourceLocation, Thread } from './Types'
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
        (item.file === null || isString(item.file)) &&
        (item.position === null || isPosition(item.position))
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
    return isObject(data) && isString(data.id) && isString(data.name)
}

export function isPackage(data: unknown): data is Package {
    return isObject(data) && isString(data.name) && isArray(data.exports, isString) && isArray(data.nicknames, isString)
}
