import { Expr, Atom, SExpr } from './Expr'
import { StringMap } from '../swank/Types'

export function exprToString(expr: Expr): string | undefined {
    if (!(expr instanceof Atom)) {
        return undefined
    }

    const op = expr as Atom
    return valueToString(op.value)
}

export function exprToNumber(expr: Expr): number | undefined {
    if (!(expr instanceof Atom)) {
        return undefined
    }

    const op = expr as Atom

    return valueToNumber(op.value)
}

export function valueToString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

export function valueToNumber(value: unknown): number | undefined {
    if (value === undefined) {
        return undefined
    }

    if (typeof value === 'number') {
        return value
    } else if (typeof value === 'string') {
        const num = parseInt(value)
        return Number.isNaN(num) ? undefined : num
    }

    return undefined
}

export function valueToArray(value: unknown): unknown[] | undefined {
    return Array.isArray(value) ? value : undefined
}

export function valueToMap(value: unknown): StringMap | undefined {
    return isObject(value) ? (value as StringMap) : undefined
}

export function isObject(value: unknown): boolean {
    return typeof value === 'object' && value !== null
}

export function isString(value: unknown): boolean {
    return typeof value === 'string'
}
