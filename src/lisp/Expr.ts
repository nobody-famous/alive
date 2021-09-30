import {
    COMMENT,
    ERROR,
    ExprMap,
    MISMATCHED_BAR,
    MISMATCHED_CLOSE_PARENS,
    MISMATCHED_COMMENT,
    MISMATCHED_DBL_QUOTE,
    MISMATCHED_OPEN_PARENS,
    Position,
} from './Types'
import { exprToString, exprToStringArray, isLetName } from './Utils'

export class Expr {
    start: Position
    end: Position

    constructor(start: Position, end: Position) {
        this.start = start
        this.end = end
    }
}

export class Atom extends Expr {
    value: unknown
    type: number

    constructor(start: Position, end: Position, value: unknown, type: number) {
        super(start, end)

        this.value = value
        this.type = type
    }

    isComment(): boolean {
        return this.type === COMMENT
    }

    isError(): boolean {
        switch (this.type) {
            case ERROR:
            case MISMATCHED_OPEN_PARENS:
            case MISMATCHED_CLOSE_PARENS:
            case MISMATCHED_DBL_QUOTE:
            case MISMATCHED_COMMENT:
            case MISMATCHED_BAR:
                return true
            default:
                return false
        }
    }
}

export class SExpr extends Expr {
    parts: Expr[]

    constructor(start: Position, end: Position, parts: Expr[]) {
        super(start, end)

        this.parts = parts
    }

    getName(): string | undefined {
        if (this.parts.length === 0) {
            return undefined
        }

        return exprToString(this.parts[0])
    }
}

export class DefPackage extends Expr {
    name: string
    uses: string[]
    exports: string[]
    nicknames: { [index: string]: string }

    constructor(
        start: Position,
        end: Position,
        name: string,
        uses: string[],
        exps: string[],
        nicknames: { [index: string]: string }
    ) {
        super(start, end)

        this.name = name
        this.uses = uses
        this.exports = exps
        this.nicknames = nicknames
    }

    static from(expr: SExpr): DefPackage | undefined {
        const exprName = expr.getName()?.toUpperCase()
        const pkgName = exprToString(expr.parts[1])

        if (exprName !== 'DEFPACKAGE' || pkgName === undefined) {
            return undefined
        }

        let uses: string[] = []
        let exports: string[] = []
        let nicknames: { [index: string]: string } = {}

        for (let ndx = 2; ndx < expr.parts.length; ndx += 1) {
            const part = expr.parts[ndx]

            if (!(part instanceof SExpr)) {
                continue
            }

            const child = exprToString(part.parts[0])?.toUpperCase()
            if (child === ':USE') {
                uses = this.getUsesList(part)
            } else if (child === ':EXPORT') {
                exports = exprToStringArray(part) ?? []
            } else if (child === ':LOCAL-NICKNAMES') {
                nicknames = this.getNicknames(part) ?? []
            }
        }

        return new DefPackage(expr.start, expr.end, pkgName, uses, exports, nicknames)
    }

    static getNicknames(expr: Expr): { [index: string]: string } {
        if (!(expr instanceof SExpr) || expr.parts.length < 2) {
            return {}
        }

        const nicknames: { [index: string]: string } = {}

        for (let ndx = 1; ndx < expr.parts.length; ndx += 1) {
            const part = expr.parts[ndx]
            if (!(part instanceof SExpr)) {
                continue
            }

            const nicknameStr = exprToString(part.parts[0])
            const targetStr = exprToString(part.parts[1])

            if (nicknameStr === undefined || targetStr === undefined) {
                continue
            }

            nicknames[nicknameStr] = targetStr
        }

        return nicknames
    }

    static getUsesList(expr: Expr): string[] {
        const symbols = exprToStringArray(expr)?.slice(1)
        if (symbols === undefined) {
            return []
        }

        return this.convertUsesList(symbols.slice(1))
    }

    static convertUsesList(list: string[]): string[] {
        return list.map((i) => {
            const item = i.toUpperCase()
            return item === 'CL' || item === 'COMMON-LISP' || item === 'COMMON-LISP-USER' ? 'CL-USER' : item
        })
    }
}

export class InPackage extends Expr {
    name: string

    constructor(start: Position, end: Position, name: string) {
        super(start, end)

        this.name = name
    }

    static from(expr: Expr): InPackage | undefined {
        if (!(expr instanceof SExpr)) {
            return undefined
        }

        const exprName = expr.getName()?.toUpperCase()
        const pkgName = exprToString(expr.parts[1])

        if (exprName !== 'IN-PACKAGE' || pkgName === undefined) {
            return undefined
        }

        return new InPackage(expr.start, expr.end, pkgName.toUpperCase())
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

    static from(expr: SExpr): Defun | undefined {
        const exprName = expr.getName()?.toUpperCase()

        if (exprName !== 'DEFUN' || expr.parts.length < 3) {
            return undefined
        }

        const name = exprToString(expr.parts[1]) ?? ''
        const args = exprToStringArray(expr.parts[2]) ?? []
        const body = expr.parts.slice(3)

        return new Defun(expr.start, expr.end, name, args, body)
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

    static from(expr: SExpr): Let | undefined {
        const exprName = expr.getName()?.toUpperCase()

        if (!isLetName(exprName) || expr.parts.length < 2) {
            return undefined
        }

        const vars = this.getVarsMap(expr.parts[1])
        const body = expr.parts.slice(2)

        return new Let(expr.start, expr.end, vars, body)
    }

    static getVarsMap(expr: Expr): ExprMap {
        const exprMap: ExprMap = {}

        if (!(expr instanceof SExpr)) {
            return exprMap
        }

        for (const item of expr.parts) {
            if (!(item instanceof SExpr) || item.parts.length !== 2) {
                continue
            }

            const name = exprToString(item.parts[0])
            const value = item.parts[1]

            if (name !== undefined && value !== undefined) {
                exprMap[name] = value
            }
        }

        return exprMap
    }
}
