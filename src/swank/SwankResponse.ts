import { Lexer } from '../Lexer'
import { AST, Expr, Node, Parser, SExpr, Atom } from '../lisp'
import * as types from '../Types'
import { SwankEvent, SwankRawEvent, createRawEvent } from './SwankEvent'
import { convertArray, plistToObj } from './SwankUtils'
import { Encoding } from './Types'
import { ReturnEvent } from './ReturnEvent'

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

        for (const expr of exprs) {
            if (!(expr instanceof SExpr)) {
                console.log(`parseEvent invalid SExpr`, expr)
                continue
            }

            const rawEvent = this.getRawEvent(expr as SExpr)

            return rawEvent !== undefined ? this.convertRawEvent(rawEvent) : undefined
        }

        return undefined
    }

    convertRawEvent(rawEvent: SwankRawEvent): SwankEvent | undefined {
        if (rawEvent.op === ':RETURN') {
            return this.buildReturnEvent(rawEvent)
        }

        throw new Error(`UNHANDLED OP ${rawEvent.op}`)
    }

    getRawEvent(expr: SExpr): SwankRawEvent | undefined {
        const sexpr = expr as SExpr
        const [opExpr, argsExpr, msgIdExpr] = sexpr.parts

        if (!(argsExpr instanceof SExpr)) {
            throw new Error('argsExpr IS NOT SExpr')
        }

        return createRawEvent(opExpr, argsExpr, msgIdExpr)
    }

    buildReturnEvent(rawEvent: SwankRawEvent): ReturnEvent {
        return new ReturnEvent(rawEvent.args)
    }

    astToArray(ast: AST): string[] {
        const arr: string[] = []

        ast.nodes.forEach((node) => {
            const value = this.nodeToArray(node)

            if (value !== undefined) {
                arr.push(value)
            }
        })

        return arr
    }

    nodeToArray(node: Node): any {
        if (node.value !== undefined && node.value.type !== types.WHITE_SPACE) {
            return [node.value.text]
        }

        if (node.kids.length > 0) {
            let arr: Array<string | string[]> = []

            node.kids.forEach((kid) => {
                const value = this.nodeToArray(kid)

                if (value !== undefined) {
                    arr.push(value)
                }
            })

            return arr
        }

        return undefined
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

export class EvalResp {
    result: string

    constructor(data: any[]) {
        let count = 0

        for (let ndx = 0; ndx < data.length; ndx += 1) {
            if (data[ndx] === '""') {
                count += 1
            }
        }

        data.splice(0, count)
        this.result = convertArray(data).join('\n')
    }
}

export class ConnectionInfoResp {
    pid?: number
    encoding?: Encoding
    impl?: { [index: string]: any }
    machine?: { [index: string]: any }
    package?: { [index: string]: any }
    style?: string
    features?: any[]
    modules?: any[]
    version?: string

    constructor(data: any[]) {
        const obj = plistToObj(data)

        if (obj === undefined) {
            return
        }

        this.pid = obj.pid !== undefined ? parseInt(obj.pid) : undefined

        if (obj.encoding !== undefined) {
            const plist = plistToObj(obj['encoding'])

            this.encoding = {} as Encoding
            if (plist !== undefined) {
                this.encoding.coding_systems = convertArray(plist.coding_systems)
            }
        }

        this.impl = plistToObj(obj.lisp_implementation)
        this.machine = plistToObj(obj.machine)
        this.package = plistToObj(obj.package)

        this.style = obj.style
        this.features = convertArray(obj.features)
        this.modules = convertArray(obj.modules)
        this.version = obj.version
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
