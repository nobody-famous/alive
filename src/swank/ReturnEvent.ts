import { exprToString, SExpr, Expr } from '../lisp'
import { SwankEvent } from './SwankEvent'
import { plistToObj } from './SwankUtils'
import { format } from 'util'

interface Info {
    status: string
    payload: unknown
}

export class ReturnEvent implements SwankEvent {
    op: string
    id: number
    info?: Info

    constructor(msgID: number, sexpr: SExpr) {
        this.op = ':RETURN'
        this.id = msgID

        const status = exprToString(sexpr.parts[0])
        const payloadExpr = sexpr.parts[1]

        if (status === undefined || !(payloadExpr instanceof SExpr)) {
            throw new Error(`ReturnEvent Invalid SExpr ${format(payloadExpr)}`)
        }

        const payloadSExpr = payloadExpr as SExpr
        const payload = payloadSExpr.parts

        this.info = { status, payload }
    }
}
