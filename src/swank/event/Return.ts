import { format } from 'util'
import { exprToNumber, exprToString, SExpr } from '../../lisp'
import { SwankEvent, SwankRawEvent } from './SwankEvent'

interface Info {
    status: string
    payload: unknown
}

export class Return implements SwankEvent {
    op: string
    id: number
    info: Info

    constructor(msgID: number, info: Info) {
        this.op = ':RETURN'
        this.id = msgID
        this.info = info
    }

    static from(event: SwankRawEvent): Return | undefined {
        if (event.op !== ':RETURN' || event.payload.length !== 2) {
            return undefined
        }

        const retValue = event.payload[0]
        const msgID = exprToNumber(event.payload[1])

        if (!(retValue instanceof SExpr) || msgID === undefined) {
            throw new Error(`ReturnEvent Invalid Event ${format(event)}`)
        }

        const status = exprToString(retValue.parts[0])
        if (status === undefined) {
            throw new Error(`ReturnEvent Invalid Event ${format(event)}`)
        }

        const payload = retValue.parts[1]

        if (retValue.parts.length > 2) {
            throw new Error(`ReturnEvent parts ${retValue.parts.length}`)
        }

        return new Return(msgID, { status, payload })
    }
}
