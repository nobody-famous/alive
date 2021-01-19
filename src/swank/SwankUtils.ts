import { Expr, exprToString, SExpr } from '../lisp'
import { LispID, LispQuote, LispSymbol } from './LispID'
import { StringMap } from './Types'

export function plistToObj(exprs: Expr[]): { [index: string]: unknown } | undefined {
    if (exprs.length % 2 !== 0) {
        return undefined
    }

    const obj: StringMap = {}

    for (let ndx = 0; ndx < exprs.length; ndx += 2) {
        let name = exprToString(exprs[ndx])
        let value: string | { [index: string]: unknown } | undefined = exprToString(exprs[ndx + 1])

        if (name !== undefined) {
            const converted = convert(name)
            if (typeof converted === 'string') {
                name = converted
            }
        }

        if (typeof value === 'string') {
            const converted = convert(value)
            if (typeof converted === 'string') {
                value = converted
            }
        } else if (value === undefined && exprs[ndx + 1] instanceof SExpr) {
            const sexpr = exprs[ndx + 1] as SExpr
            value = plistToObj(sexpr.parts)
        }

        if (name !== undefined && value !== undefined) {
            obj[name.toLowerCase()] = value
        }
    }

    return obj
}

export function convert(symbol: string): string | boolean | undefined {
    const lower = symbol.toLowerCase()

    if (lower === 't') {
        return true
    } else if (lower === 'nil') {
        return undefined
    }

    if (symbol.charAt(0) === ':') {
        return symbol.substring(1).replace(/-/, '_')
    }

    if (symbol.charAt(0) === '"' && symbol.charAt(symbol.length - 1) === '"') {
        return symbol.substring(1, symbol.length - 1)
    }

    return symbol
}

export function toWire(item: unknown): string {
    let str = ''

    if (Array.isArray(item)) {
        str += arrayToWire(item)
    } else if (item instanceof LispSymbol) {
        str += `:${item.id}`
    } else if (item instanceof LispID) {
        str += `${item.id}`
    } else if (item instanceof LispQuote) {
        str += `'${item.form}`
    } else if (typeof item === 'object' && item !== null) {
        str += objectToWire(item as StringMap)
    } else if (typeof item === 'string') {
        str += `"${item.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    } else if (item === true) {
        str += `t`
    } else if (item === false) {
        str += `nil`
    } else {
        str += item
    }

    return str
}

function objectToWire(obj: StringMap) {
    let str = '('
    const keys = Object.keys(obj)

    for (let ndx = 0; ndx < keys.length - 1; ndx += 1) {
        const key = keys[ndx]

        str += `:${key} ${toWire(obj[key])} `
    }

    const key = keys[keys.length - 1]
    str += `:${key} ${toWire(obj[key])}`

    return str + ')'
}

function arrayToWire(arr: unknown[]) {
    let str = '('

    for (let ndx = 0; ndx < arr.length - 1; ndx += 1) {
        str += toWire(arr[ndx]) + ' '
    }

    str += toWire(arr[arr.length - 1]) + ')'

    return str
}
