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

    constructor(data: SExpr) {
        this.op = ':RETURN'
        this.id = 0

        const status = exprToString(data.parts[0])
        const argsExpr = data.parts[1]

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
