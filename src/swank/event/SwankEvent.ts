import { Expr, exprToString } from '../../lisp'

export interface SwankEvent {
    op: string
}

export class SwankRawEvent {
    op: string
    payload: Expr[]

    constructor(op: string, payload: Expr[]) {
        this.op = op
        this.payload = payload
    }

    static create(opExpr: Expr, payload: Expr[]): SwankRawEvent | undefined {
        const op = exprToString(opExpr)

        if (op === undefined) {
            return undefined
        }

        return new SwankRawEvent(op, payload)
    }
}
