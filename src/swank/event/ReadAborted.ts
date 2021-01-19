import { exprToNumber } from '../../lisp'
import { SwankEvent, SwankRawEvent } from './SwankEvent'

export class ReadAborted implements SwankEvent {
    op: string
    threadID: number
    tag: number

    constructor(threadID: number, tag: number) {
        this.op = ':READ-ABORTED'
        this.threadID = threadID
        this.tag = tag
    }

    static from(event: SwankRawEvent): ReadAborted | undefined {
        if (event.payload.length !== 2) {
            return undefined
        }

        const thread = exprToNumber(event.payload[0])
        const tag = exprToNumber(event.payload[1])

        if (thread === undefined || tag === undefined) {
            return undefined
        }

        return new ReadAborted(thread, tag)
    }
}
