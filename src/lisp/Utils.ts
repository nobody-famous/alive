import { StringMap } from '../swank/Types'
import { Atom, Expr, SExpr } from './Expr'
import { convert } from '../swank/SwankUtils'
import { Lexer } from './Lexer'
import { Token } from './Token'

let lexTokenMap: { [index: string]: Token[] } = {}

export function readLexTokens(fileName: string, text: string): Token[] {
    const lex = new Lexer(text)

    lexTokenMap[fileName] = lex.getTokens()

    return lexTokenMap[fileName]
}

export function getLexTokens(fileName: string): Token[] | undefined {
    return lexTokenMap[fileName]
}

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

export function exprToNumberArray(expr: Expr): number[] | undefined {
    if (!(expr instanceof SExpr)) {
        return undefined
    }

    const nums: number[] = []
    for (const part of expr.parts) {
        const num = exprToNumber(part)

        if (num !== undefined) {
            nums.push(num)
        }
    }

    return nums
}

export function exprToStringArray(expr: Expr): string[] | undefined {
    if (!(expr instanceof SExpr)) {
        return undefined
    }

    const strings: string[] = []

    for (const part of expr.parts) {
        const str = exprToString(part)

        if (str === undefined) {
            break
        }

        const converted = convert(str)

        if (typeof converted === 'string') {
            strings.push(converted)
        }
    }

    return strings
}

export function valueToString(value: unknown): string | undefined {
    return typeof value === 'string' && value.toLowerCase() !== 'nil' ? value : undefined
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
