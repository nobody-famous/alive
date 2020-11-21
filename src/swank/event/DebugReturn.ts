import { SwankEvent, SwankRawEvent } from './SwankEvent'
import { exprToNumber } from '../../lisp'

export class DebugReturn implements SwankEvent {
    op: string
    threadID: number
    frameID: number
    stepping?: boolean

    constructor(threadID: number, frameID: number, stepping?: boolean) {
        this.op = ':DEBUG-RETURN'
        this.threadID = threadID
        this.frameID = frameID
        this.stepping = stepping
    }

    static from(event: SwankRawEvent): DebugReturn | undefined {
        if (event.payload.length < 2) {
            return undefined
        }

        const threadID = exprToNumber(event.payload[0])
        const frameID = exprToNumber(event.payload[1])

        if (threadID !== undefined && frameID !== undefined) {
            return new DebugReturn(threadID, frameID)
        }

        return undefined
    }
}
