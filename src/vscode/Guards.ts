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
    if (typeof item !== 'object' || item === undefined) {
        return false
    }

    const itemObj = item as { [index: string]: unknown }

    if (typeof itemObj.name !== 'string' || typeof itemObj.description !== 'string') {
        return false
    }

    return true
}

export function isInspectResult(data: unknown): data is InspectResult {
    if (typeof data !== 'object' || data === null) {
        return false
    }

    const obj = data as { [index: string]: unknown }
    const id = parseToInt(obj.id)
    const resultType = obj.resultType
    const result = obj.result

    if (!Number.isFinite(id) || typeof result === undefined || typeof resultType !== 'string') {
        return false
    }

    return true
}
