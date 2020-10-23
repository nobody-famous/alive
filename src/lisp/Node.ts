import * as types from '../Types'
import { Atom, DefPackage, Defun, Expr, If, InPackage, Let, SExpr } from './Expr'
import { Token } from '../Token'
import { ExprMap, NameValuePair } from './Types'

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

    toExpr() {
        if (this.value !== undefined) {
            return this.toAtomExpr()
        }

        return this.toSexpr()
    }

    toAtomExpr() {
        return this.value !== undefined && this.value.type !== types.WHITE_SPACE
            ? new Atom(this.value.start, this.value.end, this.value.text)
            : undefined
    }

    toSexpr() {
        const kids = this.removeWS(this.kids)
        if (kids === undefined || kids.length === 0) {
            return undefined
        }

        if (kids[0].value === undefined) {
            return this.toSExpr(kids)
        }

        switch (kids[0].value.text) {
            case 'DEFPACKAGE':
                return this.toDefPackageExpr(kids)
            case 'DEFUN':
                return this.toDefunExpr(kids)
            case 'IF':
                return this.toIfExpr(kids)
            case 'IN-PACKAGE':
                return this.toInPackageExpr(kids)
            case 'LET':
            case 'LET*':
                return this.toLetExpr(kids)
            default:
                return this.toSExpr(kids)
        }
    }

    toSExpr(kids: Node[]): SExpr | undefined {
        if (this.open === undefined || this.close === undefined) {
            return undefined
        }

        const parts = []

        for (const kid of kids) {
            parts.push(kid.toExpr())
        }

        return new SExpr(this.open.start, this.close.end, parts)
    }

    toLetExpr(kids: Node[]): Let | undefined {
        if (this.open === undefined || this.close === undefined || kids.length < 2) {
            return undefined
        }

        const vars = this.toNameValueMap(kids[1])
        const body = this.toExprList(kids, 2)

        return new Let(this.open.start, this.close.end, vars, body)
    }

    toNameValueMap(node: Node): ExprMap {
        const map: ExprMap = {}

        for (let ndx = 0; ndx < node.kids.length; ndx += 1) {
            const pair = this.toNameValuePair(node.kids[ndx])
            if (pair === undefined) {
                continue
            }

            map[pair.name] = pair.value
        }

        return map
    }

    toNameValuePair(node: Node): NameValuePair | undefined {
        if (node.kids.length !== 2 || node.kids[0].value === undefined) {
            return undefined
        }

        const name = node.kids[0].value.text
        const value = node.kids[1].toExpr()

        if (name === undefined || value === undefined) {
            return undefined
        }

        return {
            name,
            value,
        }
    }

    toIfExpr(kids: Node[]): If | undefined {
        if (this.open === undefined || this.close === undefined || kids.length < 3) {
            return undefined
        }

        const cond = kids[1].toExpr()
        const trueExpr = kids.length > 2 ? kids[2].toExpr() : undefined
        const falseExpr = kids.length > 3 ? kids[2].toExpr() : undefined

        if (cond === undefined) {
            return undefined
        }

        return new If(this.open.start, this.close.end, cond, trueExpr, falseExpr)
    }

    toDefunExpr(kids: Node[]): Defun | undefined {
        if (
            this.open === undefined ||
            this.close === undefined ||
            kids.length < 3 ||
            kids[1].value?.text === undefined
        ) {
            return undefined
        }

        const name = kids[1].value.text
        const args = this.toList(kids[2])
        const body = this.toExprList(kids, 3)

        return new Defun(this.open.start, this.close.end, name, args, body)
    }

    toExprList(kids: Node[], startNdx: number): Expr[] {
        const list = []

        for (let ndx = startNdx; ndx < kids.length; ndx += 1) {
            const node = kids[ndx]
            const expr = node.toExpr()

            if (expr !== undefined) {
                list.push(expr)
            }
        }

        return list
    }

    toList(node?: Node): string[] {
        if (node === undefined) {
            return []
        }

        const items = []

        for (const item of node.kids) {
            if (item.value === undefined) {
                continue
            }

            items.push(item.value.text)
        }

        return items
    }

    toInPackageExpr(kids: Node[]): InPackage | undefined {
        if (this.open === undefined || this.close === undefined || kids.length < 2 || kids[1].value === undefined) {
            return undefined
        }

        const name = this.convertName(kids[1].value)

        return new InPackage(this.open.start, this.close.end, name)
    }

    toDefPackageExpr(kids: Node[]): DefPackage | undefined {
        if (this.open === undefined || this.close === undefined || kids.length < 2 || kids[1].value === undefined) {
            return undefined
        }

        const name = this.packageName(kids[1].value)
        let uses: string[] = []
        let exports: string[] = []

        for (let ndx = 2; ndx < kids.length; ndx += 1) {
            const kid = kids[ndx]

            if (this.isChildExpr(kid, ':USE')) {
                uses = this.getSymbolList(kid)
                this.convertUsesList(uses)
            } else if (this.isChildExpr(kid, ':EXPORT')) {
                exports = this.getSymbolList(kid)
            }
        }

        return new DefPackage(this.open.start, this.close.end, name, uses, exports)
    }

    convertUsesList(list: string[]) {
        for (let ndx = 0; ndx < list.length; ndx += 1) {
            const item = list[ndx]

            if (item === 'CL' || item === 'COMMON-LISP' || item === 'COMMON-LISP-USER') {
                list[ndx] = 'CL-USER'
            }
        }
    }

    getSymbolList(node: Node): string[] {
        const list = []

        for (let ndx = 1; ndx < node.kids.length; ndx += 1) {
            const value = node.kids[ndx].value
            if (value !== undefined) {
                list.push(this.convertName(value))
            }
        }

        return list
    }

    isChildExpr(node: Node, name: string) {
        if (node.kids.length === 0 || node.kids[0].value === undefined) {
            return false
        }

        return node.kids[0].value.text === name
    }

    packageName(token: Token) {
        let name = this.convertName(token)

        if (name === 'COMMON-LISP-USER') {
            name = 'CL-USER'
        }

        return name
    }

    convertName(token: Token) {
        return token.type == types.SYMBOL ? token.text.substring(1) : token.text
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
