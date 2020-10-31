import { SwankEvent, SwankRawEvent } from './SwankEvent'
import { exprToNumber } from '../lisp'

export class DebugActivateEvent implements SwankEvent {
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

    static fromRaw(event: SwankRawEvent): DebugActivateEvent | undefined {
        if (event.payload.length < 2) {
            return undefined
        }

        const threadID = exprToNumber(event.payload[0])
        const frameID = exprToNumber(event.payload[1])

        if (threadID !== undefined && frameID !== undefined) {
            return new DebugActivateEvent(threadID, frameID)
        }

        return undefined
    }
}
