import { exprToNumber } from '../../lisp'
import { SwankEvent, SwankRawEvent } from './SwankEvent'

export class ReadString implements SwankEvent {
    op: string
    threadID: number
    tag: number

    constructor(threadID: number, tag: number) {
        this.op = ':READ-STRING'
        this.threadID = threadID
        this.tag = tag
    }

    static from(event: SwankRawEvent): ReadString | undefined {
        if (event.payload.length !== 2) {
            return undefined
        }

        const thread = exprToNumber(event.payload[0])
        const tag = exprToNumber(event.payload[1])

        if (thread === undefined || tag === undefined) {
            return undefined
        }

        return new ReadString(thread, tag)
    }
}
