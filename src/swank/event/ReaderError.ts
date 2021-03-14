import { Atom, exprToNumber, exprToString } from '../../lisp'
import { SwankEvent, SwankRawEvent } from './SwankEvent'

export class ReaderError implements SwankEvent {
    op: string
    packet: string
    cause: string

    constructor(packet: string, cause: string) {
        this.op = ':READER-ERROR'
        this.packet = packet
        this.cause = cause
    }

    static from(event: SwankRawEvent): ReaderError | undefined {
        if (event.payload.length !== 2) {
            return undefined
        }

        const payload = event.payload
        const packetExpr = payload[0]
        const causeExpr = payload[1]

        if (!(causeExpr instanceof Atom) || !(packetExpr instanceof Atom)) {
            return undefined
        }

        const cause = exprToString(causeExpr)
        const packet = exprToString(packetExpr)

        if (cause === undefined || packet === undefined) {
            return undefined
        }

        return new ReaderError(packet, cause)
    }
}
