import { exprToNumber, exprToString } from '../../lisp'
import { SwankEvent, SwankRawEvent } from './SwankEvent'

export class InvalidRpc implements SwankEvent {
    op: string
    msgID: number
    reason: string

    constructor(msgID: number, reason: string) {
        this.op = ':INVALID-RPC'
        this.msgID = msgID
        this.reason = reason
    }

    static from(event: SwankRawEvent): InvalidRpc | undefined {
        if (event.payload.length !== 2) {
            return undefined
        }

        const msgID = exprToNumber(event.payload[0])
        const reason = exprToString(event.payload[1])

        if (msgID === undefined || reason === undefined) {
            return undefined
        }

        return new InvalidRpc(msgID, reason)
    }
}
