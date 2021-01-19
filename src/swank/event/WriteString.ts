import { exprToString } from '../../lisp'
import { SwankEvent, SwankRawEvent } from './SwankEvent'

export class WriteString implements SwankEvent {
    op: string
    text: string
    target?: string

    constructor(text: string, target?: string) {
        this.op = ':WRITE-STRING'
        this.text = text
        this.target = target
    }

    static from(event: SwankRawEvent): WriteString | undefined {
        if (event.payload.length < 1) {
            return undefined
        }

        const text = exprToString(event.payload[0])
        const target = exprToString(event.payload[1])

        if (text === undefined) {
            return undefined
        }

        return new WriteString(text, target)
    }
}
