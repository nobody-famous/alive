import { format } from 'util'
import { Atom, Expr, exprToNumber, exprToNumberArray, exprToString, exprToStringArray, SExpr } from '../lisp'
import { SwankEvent, SwankRawEvent } from './SwankEvent'
import { convert } from './SwankUtils'
import { Frame, FrameOption, Restart } from './Types'

export class DebugEvent implements SwankEvent {
    op: string
    threadID: number
    frameID: number
    condition: string[]
    restarts: Restart[]
    frames: Frame[]
    conts: number[]

    constructor(threadID: number, frameID: number, condition: string[], restarts: Restart[], frames: Frame[], conts: number[]) {
        this.op = ':DEBUG'
        this.threadID = threadID
        this.frameID = frameID
        this.condition = condition
        this.restarts = restarts
        this.frames = frames
        this.conts = conts
    }

    static fromRaw(event: SwankRawEvent): DebugEvent | undefined {
        if (event.payload.length !== 6 || !(event.payload[2] instanceof SExpr)) {
            throw new Error(`DebugEvent Invalid ${format(event)}`)
        }

        const threadID = exprToNumber(event.payload[0])
        const frameID = exprToNumber(event.payload[1])
        const condition = exprToStringArray(event.payload[2])
        const restarts = this.convertRestarts(event.payload[3])
        const frames = this.convertFrames(event.payload[4])
        const conts = exprToNumberArray(event.payload[5])

        if (
            threadID === undefined ||
            frameID === undefined ||
            condition === undefined ||
            restarts === undefined ||
            frames === undefined ||
            conts === undefined
        ) {
            return undefined
        }

        return new DebugEvent(threadID, frameID, condition, restarts, frames, conts)
    }

    static convertFrames(expr: Expr): Frame[] | undefined {
        if (!(expr instanceof SExpr)) {
            return undefined
        }

        const frames: Frame[] = []
        for (const frame of expr.parts) {
            if (!(frame instanceof SExpr) || frame.parts.length < 2) {
                return undefined
            }

            const frameNum = exprToNumber(frame.parts[0])
            const frameDesc = exprToString(frame.parts[1])
            const opts = frame.parts.length > 2 ? this.convertFrameOptions(frame.parts) : undefined

            if (frameNum !== undefined && frameDesc !== undefined) {
                const converted = convert(frameDesc)

                frames.push({
                    num: frameNum,
                    desc: typeof converted === 'string' ? converted : frameDesc,
                    opts,
                })
            }
        }

        return frames
    }

    static convertFrameOptions(parts: Expr[]): FrameOption[] | undefined {
        const opts: FrameOption[] = []

        for (let ndx = 2; ndx < parts.length; ndx += 1) {
            const optExpr = parts[ndx]

            if (!(optExpr instanceof SExpr)) {
                continue
            }

            const name = exprToString(optExpr.parts[0])
            const valueExpr = optExpr.parts[1]
            let value: string | boolean | undefined = undefined

            if (valueExpr instanceof Atom && typeof valueExpr.value === 'string') {
                value = convert(valueExpr.value)
            }

            if (name !== undefined && value !== undefined) {
                opts.push({ name, value })
            }
        }

        return opts
    }

    static convertRestarts(expr: Expr): Restart[] | undefined {
        if (!(expr instanceof SExpr)) {
            return undefined
        }

        const restarts: Restart[] = []
        for (const part of expr.parts) {
            if (!(part instanceof SExpr) || part.parts.length !== 2) {
                return undefined
            }

            const name = exprToString(part.parts[0])
            const desc = exprToString(part.parts[1])

            if (name !== undefined && desc !== undefined) {
                restarts.push({ name, desc })
            }
        }

        return restarts
    }
}
