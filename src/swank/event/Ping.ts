import { exprToNumber } from '../../lisp'
import { SwankEvent, SwankRawEvent } from './SwankEvent'

export class Ping implements SwankEvent {
    op: string
    threadID: number
    tag: number

    constructor(threadID: number, tag: number) {
        this.op = ':PING'
        this.threadID = threadID
        this.tag = tag
    }

    static from(event: SwankRawEvent): Ping | undefined {
        if (event.payload.length !== 2) {
            return undefined
        }

        const thread = exprToNumber(event.payload[0])
        const tag = exprToNumber(event.payload[1])

        if (thread === undefined || tag === undefined) {
            return undefined
        }

        return new Ping(thread, tag)
    }
}
