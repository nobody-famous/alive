import { exprToString, SExpr } from '../lisp'
import { SwankEvent } from './SwankEvent'
import { plistToObj } from './SwankUtils'

interface Info {
    status: string
    args: unknown
}

export class ReturnEvent implements SwankEvent {
    op: string
    id: number
    info?: Info

    constructor(msgID: number, sexpr: SExpr) {
        this.op = ':RETURN'
        this.id = msgID

        const status = exprToString(sexpr.parts[0])
        const argsExpr = sexpr.parts[1]

        if (status === undefined || !(argsExpr instanceof SExpr)) {
            throw new Error('ReturnEvent Invalid SExpr')
        }

        const argsSExpr = argsExpr as SExpr

        const args = plistToObj(argsSExpr.parts)
        if (args === undefined) {
            throw new Error('ReturnEvent Invalid plist')
        }

        this.info = { status, args }
    }
}
