import { Position } from 'vscode'
import { RestartInfo, SourceLocation } from './Types'

export function isPosition(item: unknown): item is Position {
    if (typeof item !== 'object' || item === undefined) {
        return false
    }

    const itemObj = item as { [index: string]: unknown }

    if (typeof itemObj.line !== 'number' || typeof itemObj.character !== 'number') {
        return false
    }

    return true
}

export function isSourceLocation(item: unknown): item is SourceLocation {
    if (typeof item !== 'object' || item === undefined) {
        return false
    }

    const itemObj = item as { [index: string]: unknown }

    if (typeof itemObj.function !== 'string') {
        return false
    }

    if (itemObj.file !== null && typeof itemObj.file !== 'string') {
        return false
    }

    if (itemObj.position !== null && !isPosition(itemObj.position)) {
        return false
    }

    return true
}

export function isStackTrace(item: unknown): item is SourceLocation[] {
    if (!Array.isArray(item)) {
        return false
    }

    const itemArray = item as unknown[]

    for (const item of itemArray) {
        if (!isSourceLocation(item)) {
            return false
        }
    }

    return true
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
