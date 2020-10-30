import { Lexer } from '../lisp/Lexer'
import { Expr, Parser, SExpr } from '../lisp'
import { ReturnEvent } from './ReturnEvent'
import { SwankEvent, SwankRawEvent } from './SwankEvent'
import { format } from 'util'

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

    parseEvent(exprs: Expr[]): SwankEvent | undefined {
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

    convertRawEvent(rawEvent: SwankRawEvent): SwankEvent | undefined {
        if (rawEvent.op === ':RETURN') {
            return ReturnEvent.fromRaw(rawEvent)
        } else if (rawEvent.op === ':INDENTATION-UPDATE') {
            return undefined
        }

        throw new Error(`UNHANDLED OP ${format(rawEvent)}`)
    }

    getRawEvent(expr: SExpr): SwankRawEvent | undefined {
        const sexpr = expr as SExpr
        const [opExpr, ...payload] = sexpr.parts

        return SwankRawEvent.create(opExpr, payload)
    }

    // buildReturnEvent(rawEvent: SwankRawEvent): ReturnEvent {
    //     if (rawEvent.msgID === undefined) {
    //         throw new Error(`Return Event missing message ID ${rawEvent}`)
    //     }

    //     return new ReturnEvent(rawEvent.msgID, rawEvent.args)
    // }

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

// export class LocalsResp {
//     constructor(data) {
//         this.vars = this.fromArray(data[0])
//         this.catchTags = data[1]
//     }

//     fromArray(arr) {
//         if (!Array.isArray(arr)) {
//             return arr
//         }

//         return arr.map((item) => plistToObj(item))
//     }
// }

// export class ThreadsResp {
//     constructor(data) {
//         this.headers = data[0]
//         this.info = []

//         for (let ndx = 1; ndx < data.length; ndx += 1) {
//             const [id, name, status] = data[ndx]

//             this.info.push({
//                 id: parseInt(id),
//                 name: convert(name),
//                 status: convert(status),
//             })
//         }
//     }
// }

// export class DebuggerInfoResp {
//     constructor(data: any) {
//         console.log('DebuggerInfo', data)
//     }
// }
