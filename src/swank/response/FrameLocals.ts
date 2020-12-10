import { Expr, SExpr } from '../../lisp'
import { Return } from '../event'
import { plistToObj } from '../SwankUtils'
import { FrameVariable } from '../Types'

export class FrameLocals {
    locals: FrameVariable[]

    constructor(locals: FrameVariable[]) {
        this.locals = locals
    }

    static parse(event: Return): FrameLocals | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof SExpr)) {
            return undefined
        }

        const localsExpr = payload.parts[0]
        let locals: FrameVariable[] = []

        const tagsExpr = payload.parts[1]

        if (localsExpr !== undefined && localsExpr instanceof SExpr) {
            locals = this.toFrameVarList(localsExpr)
        }

        return new FrameLocals(locals)
    }

    static toFrameVarList(expr: SExpr): FrameVariable[] {
        const list: FrameVariable[] = []

        for (const part of expr.parts) {
            if (part instanceof SExpr) {
                const variable = this.toFrameVar(part.parts)

                if (variable !== undefined) {
                    list.push(variable)
                }
            }
        }

        return list
    }

    static toFrameVar(expr: Expr[]): FrameVariable | undefined {
        const local = plistToObj(expr)
        if (local === undefined) {
            return undefined
        }

        const name = this.propToString(local, 'name')
        const value = this.propToString(local, 'value')
        const id = this.propToNumber(local, 'id')

        return { name, value, id }
    }

    static propToNumber(obj: { [index: string]: unknown }, key: string): number {
        const value = obj[key]

        if (typeof value === 'number') {
            return value
        } else if (typeof value === 'string') {
            const num = parseInt(value)
            return Number.isNaN(num) ? 0 : num
        }

        return 0
    }

    static propToString(obj: { [index: string]: unknown }, key: string): string {
        const value = obj[key]

        if (typeof value === 'string') {
            return value as string
        }

        return ''
    }
}
