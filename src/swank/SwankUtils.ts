import { Expr, exprToString, SExpr } from '../lisp'
import { LispID, LispQuote, LispSymbol } from './LispID'

export function plistToObj(exprs: Expr[]): { [index: string]: any } | undefined {
    if (exprs.length % 2 !== 0) {
        return undefined
    }

    const obj: { [index: string]: any } = {}

    for (let ndx = 0; ndx < exprs.length; ndx += 2) {
        let name = exprToString(exprs[ndx])
        let value: string | { [index: string]: any } | undefined = exprToString(exprs[ndx + 1])

        if (name !== undefined) {
            name = convert(name)
        }

        if (typeof value === 'string') {
            value = convert(value)
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

export function convert(symbol: string): any {
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

export function convertArray(arr: any[]): any[] {
    if (!Array.isArray(arr)) {
        return arr
    }

    return arr.map((item) => convert(item))
}

export function toWire(item: any): string {
    let str = ''

    if (Array.isArray(item)) {
        str += arrayToWire(item)
    } else if (item instanceof LispSymbol) {
        str += `:${item.id}`
    } else if (item instanceof LispID) {
        str += `${item.id}`
    } else if (item instanceof LispQuote) {
        str += `'${item.form}`
    } else if (typeof item === 'object') {
        str += objectToWire(item)
    } else if (typeof item === 'string') {
        str += `"${item.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    } else if (item === true) {
        str += `t`
    } else {
        str += item
    }

    return str
}

function objectToWire(obj: { [index: string]: any }) {
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

function arrayToWire(arr: any[]) {
    let str = '('

    for (let ndx = 0; ndx < arr.length - 1; ndx += 1) {
        str += toWire(arr[ndx]) + ' '
    }

    str += toWire(arr[arr.length - 1]) + ')'

    return str
}
