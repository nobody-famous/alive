import { Expr, exprToNumber, exprToString, SExpr } from '../lisp'

export interface SwankEvent {
    op: string
}

export class SwankRawEvent {
    op: string
    args: SExpr
    msgID?: number

    constructor(op: string, args: SExpr, msgID?: number) {
        this.op = op
        this.args = args
        this.msgID = msgID
    }
}

export function createRawEvent(opExpr: Expr, args: SExpr, msgIDExpr: Expr): SwankRawEvent | undefined {
    const op = exprToString(opExpr)
    const msgID = exprToNumber(msgIDExpr)

    if (op === undefined || args === undefined) {
        return undefined
    }

    return new SwankRawEvent(op, args, msgID)
}
