import { format } from 'util'
import { Expr, Parser, SExpr } from '../lisp'
import { Lexer } from '../lisp/Lexer'
import * as event from './event'
import { SwankEvent, SwankRawEvent } from './event/SwankEvent'

export class SwankResponse {
    length?: number
    buf?: Buffer
    op?: string
    data?: string

    constructor() {
        this.length = undefined
        this.buf = undefined
        this.op = undefined
        this.data = undefined
    }

    parse(): SwankEvent | undefined {
        if (this.buf === undefined) {
            return
        }

        const lex = new Lexer(this.buf.toString())
        const tokens = lex.getTokens()
        const parser = new Parser(tokens)
        const exprs = parser.parse()

        return this.parseEvent(exprs)
    }

    private parseEvent(exprs: Expr[]): SwankEvent | undefined {
        if (exprs.length > 1) {
            throw new Error('parseEvent MORE THAN ONE EVENT')
        }

        const expr = exprs[0]
        if (!(expr instanceof SExpr)) {
            throw new Error(`parseEvent invalid SExpr ${expr}`)
        }

        const rawEvent = this.getRawEvent(expr as SExpr)

        return rawEvent !== undefined ? this.convertRawEvent(rawEvent) : undefined
    }

    private convertRawEvent(rawEvent: SwankRawEvent): SwankEvent | undefined {
        switch (rawEvent.op) {
            case ':RETURN':
                return event.Return.from(rawEvent)
            case ':DEBUG':
                return event.Debug.from(rawEvent)
            case ':DEBUG-ACTIVATE':
                return event.DebugActivate.from(rawEvent)
            case ':DEBUG-RETURN':
                return event.DebugReturn.from(rawEvent)
            case ':NEW-FEATURES':
                return event.NewFeatures.from(rawEvent)
            case ':READ-STRING':
                return event.ReadString.from(rawEvent)
            case ':WRITE-STRING':
                return event.WriteString.from(rawEvent)
            case ':INVALID-RPC':
                return event.InvalidRpc.from(rawEvent)
            case ':READ-ABORTED':
                return event.ReadAborted.from(rawEvent)
            case ':INDENTATION-UPDATE':
            case ':PRESENTATION-START':
            case ':PRESENTATION-END':
                return undefined
        }

        throw new Error(`UNHANDLED OP ${format(rawEvent)}`)
    }

    private getRawEvent(expr: SExpr): SwankRawEvent | undefined {
        const sexpr = expr as SExpr
        const [opExpr, ...payload] = sexpr.parts

        return SwankRawEvent.create(opExpr, payload)
    }

    addData(data: Buffer): Buffer {
        if (this.length === undefined) {
            throw new Error('Response add data no length')
        }

        const diff = this.buf === undefined ? this.length : this.length - this.buf.length
        const toCopy = data.slice(0, diff)
        const remaining = data.slice(diff)

        this.buf = this.buf === undefined ? toCopy : Buffer.concat([this.buf, toCopy])

        return remaining
    }

    hasAllData() {
        if (this.buf === undefined || this.length === undefined) {
            return false
        }

        return this.buf.length >= this.length
    }

    readHeader(data: Buffer): Buffer {
        const header = data.slice(0, 6)
        const remaining = data.slice(6)

        this.length = parseInt(header.toString(), 16)

        if (Number.isNaN(this.length)) {
            this.length = undefined
            throw new Error(`Invalid message header "${header.toString()}"`)
        }

        return remaining
    }
}
