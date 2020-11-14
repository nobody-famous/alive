import { Node } from './Node'
import { ExprMap, Position } from './Types'
import { format } from 'util'

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

function posInNode(node: Node, pos: Position): boolean {
    if (node.value === undefined) {
        return false
    }

    return posInRange(node.value.start, node.value.end, pos)
}

function nodeToAtom(node: Node): Atom {
    const value = node.value

    if (value === undefined) {
        return new Atom(new Position(0, 0), new Position(0, 0), '')
    }

    return new Atom(value.start, value.end, value.text)
}

export function findAtom(exprs: Expr[], pos: Position): Atom | undefined {
    for (const expr of exprs) {
        if (expr instanceof Atom && posInRange(expr.start, expr.end, pos)) {
            return expr as Atom
        } else if (expr instanceof InPackage) {
            if (posInNode(expr.node.kids[0], pos)) {
                return nodeToAtom(expr.node.kids[1])
            } else if (posInNode(expr.node.kids[2], pos)) {
                return nodeToAtom(expr.node.kids[2])
            }
        } else if (expr instanceof SExpr) {
            const atom = findAtom(expr.parts, pos)
            if (atom !== undefined) {
                return atom
            }
        }
    }

    return undefined
}

export class Atom extends Expr {
    value: unknown

    constructor(start: Position, end: Position, value: unknown) {
        super(start, end)

        this.value = value
    }
}

export class SExpr extends Expr {
    parts: Expr[]

    constructor(start: Position, end: Position, parts: Expr[]) {
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
    node: Node
    name: string

    constructor(node: Node, start: Position, end: Position, name: string) {
        super(start, end)

        this.node = node
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
