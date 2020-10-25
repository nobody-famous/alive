import * as types from '../Types'
import { Node } from './Node'
import { Expr } from './Expr'
import { Token } from '../Token'

export class Parser {
    tokens: Token[]
    ndx: number

    constructor(tokens: Token[]) {
        this.tokens = tokens
        this.ndx = 0
    }

    parse(): Expr[] {
        this.ndx = 0
        const exprs = []

        while (this.peek() !== undefined) {
            const node = this.expr()
            if (node !== undefined) {
                if (node.open !== undefined && node.close === undefined) {
                    node.close = this.tokens[this.tokens.length - 1]
                }

                const expr = node.toExpr()
                if (expr !== undefined) {
                    exprs.push(expr)
                }
            }
        }

        return exprs
    }

    expr() {
        if (this.peek() === undefined) {
            return undefined
        }

        const node = new Node()

        if (this.peek()?.type === types.OPEN_PARENS || this.peek()?.type === types.MISMATCHED_OPEN_PARENS) {
            this.sexpr(node)
        } else {
            node.value = this.peek()
            this.consume()
        }

        return node
    }

    sexpr(node: Node) {
        node.open = this.peek()
        this.consume()

        while (true) {
            if (this.peek() === undefined) {
                return
            }

            if (this.peek()?.type === types.CLOSE_PARENS || this.peek()?.type === types.MISMATCHED_CLOSE_PARENS) {
                break
            }

            const e = this.expr()

            if (e !== undefined) {
                node.kids.push(e)
            }
        }

        node.close = this.peek()
        this.consume()
    }

    peek() {
        if (this.ndx === undefined || this.tokens === undefined || this.ndx >= this.tokens.length) {
            return undefined
        }

        return this.tokens[this.ndx]
    }

    consume() {
        if (this.peek() === undefined) {
            return
        }

        this.ndx += 1
    }
}
