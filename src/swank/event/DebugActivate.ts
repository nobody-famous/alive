import { SwankEvent, SwankRawEvent } from './SwankEvent'
import { exprToNumber } from '../../lisp'

export class DebugActivate implements SwankEvent {
    op: string
    threadID: number
    frameID: number
    select?: boolean

    constructor(threadID: number, frameID: number, select?: boolean) {
        this.op = ':DEBUG-ACTIVATE'
        this.threadID = threadID
        this.frameID = frameID
        this.select = select
    }

    static fromRaw(event: SwankRawEvent): DebugActivate | undefined {
        if (event.payload.length < 2) {
            return undefined
        }

        const threadID = exprToNumber(event.payload[0])
        const frameID = exprToNumber(event.payload[1])

        if (threadID !== undefined && frameID !== undefined) {
            return new DebugActivate(threadID, frameID)
        }

        return undefined
    }
}
