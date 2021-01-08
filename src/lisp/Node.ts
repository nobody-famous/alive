import { Atom, Expr, SExpr } from './Expr'
import { Token } from './Token'
import * as types from './Types'

export class Node {
    kids: Node[]
    open?: Expr
    close?: Expr
    value?: Token

    constructor() {
        this.kids = []
        this.open = undefined
        this.close = undefined
        this.value = undefined
    }

    toExpr(): Expr | undefined {
        if (this.value !== undefined) {
            return this.toAtomExpr()
        }

        return this.toListExpr()
    }

    toAtomExpr() {
        return this.value !== undefined && this.value.type !== types.WHITE_SPACE
            ? new Atom(this.value.start, this.value.end, this.value.text, this.value.type)
            : undefined
    }

    toListExpr() {
        const kids = this.removeWS(this.kids)
        if (kids === undefined || kids.length === 0) {
            return undefined
        }

        return this.toSExpr(kids)
    }

    toSExpr(kids: Node[]): SExpr | undefined {
        if (this.open === undefined || this.close === undefined) {
            return undefined
        }

        const parts: Expr[] = []

        for (const kid of kids) {
            const expr = kid.toExpr()
            if (expr !== undefined) {
                parts.push(expr)
            }
        }

        return new SExpr(this.open.start, this.close.end, parts)
    }

    removeWS(kids: Node[]): Node[] {
        const out: Node[] = []

        kids.forEach((node) => {
            if (node.value !== undefined && node.value.type !== types.WHITE_SPACE) {
                out.push(node)
            } else if (node.value === undefined) {
                node.kids = this.removeWS(node.kids)
                out.push(node)
            }
        })

        return out
    }
}
