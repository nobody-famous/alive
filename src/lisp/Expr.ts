import { Position } from 'vscode'
import { ExprMap } from './Types'

export class Expr {
    start: Position
    end: Position

    constructor(start: Position, end: Position) {
        this.start = start
        this.end = end
    }
}

export function posInExpr(expr: Expr, pos: Position): boolean {
    if (pos.line === expr.start.line) {
        return pos.character >= expr.start.character
    }

    if (pos.line === expr.end.line) {
        return pos.character <= expr.end.character
    }

    return pos.line >= expr.start.line && pos.line <= expr.end.line
}

export function findExpr(exprs: Expr[], pos: Position): Expr | undefined {
    for (let ndx = 0; ndx < exprs.length; ndx += 1) {
        const expr = exprs[ndx]

        if (exports.posInExpr(expr, pos)) {
            return expr
        }
    }

    return undefined
}

export class Atom extends Expr {
    value: any

    constructor(start: Position, end: Position, value: any) {
        super(start, end)

        this.value = value
    }
}

export class SExpr extends Expr {
    parts: any[]

    constructor(start: Position, end: Position, parts: any[]) {
        super(start, end)

        this.parts = parts
    }
}

export class DefPackage extends Expr {
    name: string
    uses: string[]
    exports: string[]

    constructor(start: Position, end: Position, name: string, uses: string[], exps: string[]) {
        super(start, end)

        this.name = name
        this.uses = uses
        this.exports = exps
    }
}

export class InPackage extends Expr {
    name: string

    constructor(start: Position, end: Position, name: string) {
        super(start, end)

        this.name = name
    }
}

export class Defun extends Expr {
    name: string
    args: string[]
    body: Expr[]

    constructor(start: Position, end: Position, name: string, args: string[], body: Expr[]) {
        super(start, end)

        this.name = name
        this.args = args
        this.body = body
    }
}

export class If extends Expr {
    cond: Expr
    trueExpr?: Expr
    falseExpr?: Expr

    constructor(start: Position, end: Position, cond: Expr, trueExpr?: Expr, falseExpr?: Expr) {
        super(start, end)

        this.cond = cond
        this.trueExpr = trueExpr
        this.falseExpr = falseExpr
    }
}

export class Let extends Expr {
    vars: ExprMap
    body: Expr[]

    constructor(start: Position, end: Position, vars: ExprMap, body: Expr[]) {
        super(start, end)

        this.vars = vars
        this.body = body
    }
}
