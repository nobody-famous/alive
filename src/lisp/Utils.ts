import { Expr, Atom, SExpr } from './Expr'

export function exprToString(expr: Expr): string | undefined {
    if (!(expr instanceof Atom)) {
        return undefined
    }

    const op = expr as Atom
    return typeof op.value === 'string' ? op.value : undefined
}

export function exprToNumber(expr: Expr): number | undefined {
    if (!(expr instanceof Atom)) {
        return undefined
    }

    const op = expr as Atom

    if (typeof op.value === 'number') {
        return op.value
    } else if (typeof op.value === 'string') {
        const num = parseInt(op.value)
        return Number.isNaN(num) ? undefined : num
    }

    return undefined
}
