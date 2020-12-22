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

export function posBeforeExpr(expr: Expr, pos: Position): boolean {
    if (pos.line > expr.start.line) {
        return false
    }

    return pos.line < expr.start.line || pos.character < expr.start.character
}

export function posAfterExpr(expr: Expr, pos: Position): boolean {
    if (pos.line < expr.end.line) {
        return false
    }

    return pos.line > expr.end.line || pos.character > expr.end.character
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
    return posAfterStart(exprStart, pos) && posBeforeEnd(exprEnd, pos)
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

export function findString(exprs: Expr[], pos: Position): string | undefined {
    const atom = findAtom(exprs, pos)

    if (atom === undefined) {
        return undefined
    }

    return exprToString(atom)
}

export function isLetName(name: string | undefined): boolean {
    const upper = name?.toUpperCase()

    return upper === 'LET' || upper === 'LET*'
}

export function isFletName(name: string | undefined): boolean {
    const upper = name?.toUpperCase()

    return upper === 'FLET' || upper === 'LABELS'
}

export function unescape(str: string): string {
    return str.replace(/\\./g, (item) => (item.length > 0 ? item.charAt(1) : item))
}

export function getLocalDef(expr: Expr, pos: Position, label: string): Expr | undefined {
    if (!(expr instanceof SExpr) || !posInExpr(expr, pos)) {
        return
    }

    const name = expr.getName()?.toUpperCase()

    if (name === 'DEFUN') {
        const argExpr = getDefunArg(expr, label)
        const bodyExpr = getBodyLocal(expr.parts.slice(3), pos, label)

        return bodyExpr ?? argExpr
    } else if (isLetName(name)) {
        return getLetDef(expr, pos, label)
    }

    return undefined
}

function getLetDef(expr: SExpr, pos: Position, label: string): Expr | undefined {
    if (expr.parts.length < 2) {
        return undefined
    }

    const bindings = expr.parts[1]
    let def: Expr | undefined = undefined

    if (bindings instanceof SExpr) {
        for (const binding of bindings.parts) {
            if (!(binding instanceof SExpr)) {
                continue
            }

            def = getComplexArg(binding, label)

            if (def !== undefined) {
                break
            }
        }
    }

    const bodyDef = getBodyLocal(expr.parts.slice(2), pos, label)

    return bodyDef ?? def
}

function getBodyLocal(body: Expr[], pos: Position, label: string): Expr | undefined {
    for (const expr of body) {
        if (posInExpr(expr, pos)) {
            return getLocalDef(expr, pos, label)
        }
    }

    return undefined
}

function getDefunArg(expr: SExpr, label: string): Expr | undefined {
    if (expr.parts.length < 3) {
        return undefined
    }

    const argList = expr.parts[2]

    if (!(argList instanceof SExpr)) {
        return undefined
    }

    for (const arg of argList.parts) {
        const nameStr = exprToString(arg)

        if (nameStr === label) {
            return arg
        } else if (arg instanceof SExpr) {
            const nameExpr = getComplexArg(arg, label)

            if (nameExpr !== undefined) {
                return nameExpr
            }
        }
    }

    return undefined
}

function getComplexArg(expr: SExpr, label: string): Expr | undefined {
    if (expr.parts.length === 0) {
        return undefined
    }

    const part = exprToString(expr.parts[0])

    if (part === label) {
        return expr.parts[0]
    }

    return undefined
}

function posAfterStart(start: Position, pos: Position): boolean {
    if (pos.line < start.line) {
        return false
    } else if (pos.line === start.line) {
        return pos.character >= start.character
    } else {
        return true
    }
}

function posBeforeEnd(end: Position, pos: Position): boolean {
    if (pos.line > end.line) {
        return false
    } else if (pos.line === end.line) {
        return pos.character <= end.character
    } else {
        return true
    }
}
