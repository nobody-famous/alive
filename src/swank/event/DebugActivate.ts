import { SwankEvent, SwankRawEvent } from './SwankEvent'
import { exprToNumber } from '../../lisp'

export class DebugActivate implements SwankEvent {
    op: string
    threadID: number
    level: number
    select?: boolean

    constructor(threadID: number, level: number, select?: boolean) {
        this.op = ':DEBUG-ACTIVATE'
        this.threadID = threadID
        this.level = level
        this.select = select
    }

    static from(event: SwankRawEvent): DebugActivate | undefined {
        if (event.payload.length < 2) {
            return undefined
        }

        const threadID = exprToNumber(event.payload[0])
        const level = exprToNumber(event.payload[1])

        if (threadID !== undefined && level !== undefined) {
            return new DebugActivate(threadID, level)
        }

        return undefined
    }
}
