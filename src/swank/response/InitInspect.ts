import { Expr, exprToNumber, exprToString, SExpr } from '../../lisp'
import { Return } from '../event'
import { convert } from '../SwankUtils'
import { InspectContent, InspectContentAction, InspectInfo } from '../Types'

export class InitInspect {
    title: string
    id: number
    content: InspectContent

    constructor(info: InspectInfo) {
        this.title = info.title
        this.id = info.id
        this.content = info.content
    }

    static parse(event: Return): InitInspect | null | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof SExpr)) {
            return null
        }

        const info = this.parsePayload(payload.parts)

        return info !== undefined ? new InitInspect(info) : undefined
    }

    static parsePayload(payload: Expr[]): InspectInfo | undefined {
        let title: string | undefined = undefined
        let id: number | undefined = undefined
        let content: InspectContent | undefined = undefined

        for (let ndx = 0; ndx < payload.length; ndx += 2) {
            const key = payload[ndx]
            const value = payload[ndx + 1]

            if (key === undefined || value === undefined) {
                return undefined
            }

            const name = exprToString(key)?.toUpperCase()

            if (name === ':TITLE') {
                title = exprToString(value)
            } else if (name === ':ID') {
                id = exprToNumber(value)
            } else if (name === ':CONTENT') {
                if (value instanceof SExpr) {
                    content = this.parseContent(value.parts)
                }
            }
        }

        if (title === undefined || id === undefined || content === undefined) {
            return undefined
        }

        return { title, id, content }
    }

    static parseContent(exprs: Expr[]): InspectContent | undefined {
        if (exprs.length !== 4) {
            return
        }

        const display = this.parseDisplay(exprs[0])
        const num1 = exprToNumber(exprs[1])
        const num2 = exprToNumber(exprs[2])
        const num3 = exprToNumber(exprs[3])

        if (display === undefined || num1 === undefined || num2 === undefined || num3 === undefined) {
            return
        }

        return { display }
    }

    static parseDisplay(expr: Expr): Array<string | InspectContentAction> | undefined {
        if (!(expr instanceof SExpr)) {
            return
        }

        const display = new Display()

        return display.parse(expr.parts)
    }
}

class Display {
    text: string = ''
    actions: InspectContentAction[] = []
    result: Array<string | InspectContentAction> = []

    parse(exprs: Expr[]) {
        for (const expr of exprs) {
            const str = exprToString(expr)

            if (str !== undefined) {
                this.parseString(str)
            } else {
                this.parseAction(expr)
            }
        }

        return this.result
    }

    private parseAction(expr: Expr) {
        if (!(expr instanceof SExpr) || expr.parts.length !== 3) {
            return
        }

        const actStr = exprToString(expr.parts[0])
        const textStr = exprToString(expr.parts[1])
        const ndx = exprToNumber(expr.parts[2])

        if (actStr === undefined || textStr === undefined || ndx === undefined) {
            return
        }

        const act = convert(actStr)
        const text = convert(textStr)

        if (typeof act !== 'string' || typeof text !== 'string') {
            return
        }

        this.actions.push({ action: act, display: text, index: ndx })
    }

    private parseString(str: string) {
        const cvt = convert(str)

        if (cvt !== '\n') {
            this.text += cvt
            return
        }

        this.result.push(this.text)
        this.result.push(...this.actions)

        this.text = ''
        this.actions = []
    }
}
