import { convert } from '../swank/SwankUtils'
import { StringMap } from '../swank/Types'
import { Atom, Expr, SExpr } from './Expr'
import { Lexer } from './Lexer'
import { Token } from './Token'
import { Position } from './Types'

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

export function posInExpr(expr: Expr, pos: Position): boolean {
    if (pos.line === expr.start.line) {
        if (expr.start.line === expr.end.line) {
            return pos.character >= expr.start.character && pos.character <= expr.end.character
        }

        return pos.character >= expr.start.character
    }

    if (pos.line === expr.end.line) {
        return pos.character <= expr.end.character
    }

    return pos.line >= expr.start.line && pos.line <= expr.end.line
}

export function findExpr(exprs: Expr[], pos: Position): Expr | undefined {
    for (const expr of exprs) {
        if (posInExpr(expr, pos)) {
            return expr
        }
    }

    return undefined
}

export function findInnerExpr(exprs: Expr[], pos: Position): Expr | undefined {
    for (const expr of exprs) {
        if (!posInExpr(expr, pos)) {
            continue
        }

        if (expr instanceof Atom) {
            return undefined
        } else if (!(expr instanceof SExpr)) {
            return expr
        }

        const tmpExpr = expr
        const inner = findInnerExpr(expr.parts, pos)

        return inner ?? tmpExpr
    }

    return undefined
}

export function posInRange(exprStart: Position, exprEnd: Position, pos: Position): boolean {
    if (pos.line === exprStart.line) {
        return pos.character >= exprStart.character && pos.character <= exprEnd.character
    }

    return false
}

export function findAtom(exprs: Expr[], pos: Position): Atom | undefined {
    for (const expr of exprs) {
        if (expr instanceof Atom && posInRange(expr.start, expr.end, pos)) {
            return expr as Atom
        } else if (expr instanceof SExpr) {
            const atom = findAtom(expr.parts, pos)
            if (atom !== undefined) {
                return atom
            }
        }
    }

    return undefined
}

export function isLetName(name: string | undefined): boolean {
    const upper = name?.toUpperCase()

    return upper === 'LET' || upper === 'LET*'
}
