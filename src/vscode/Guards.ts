import { Position } from 'vscode'
import { InspectResult, RestartInfo, SourceLocation } from './Types'
import { parseToInt } from './Utils'

export function isString(data: unknown): data is string {
    return typeof data === 'string'
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
    return isObject(item) && isString(item.function) && isString(item.file) && isPosition(item.position)
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
