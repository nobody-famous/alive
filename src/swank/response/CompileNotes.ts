import { Expr, exprToNumber, exprToString, SExpr } from '../../lisp'
import { convert } from '../SwankUtils'

export interface CompileLocation {
    file: string
    position: number
}

export class CompileNotes {
    message: string
    severity: string
    location: CompileLocation

    constructor(message: string, severity: string, location: CompileLocation) {
        this.message = message
        this.severity = severity
        this.location = location
    }

    static from(expr: Expr): CompileNotes | undefined {
        if (!(expr instanceof SExpr) || expr.parts.length === 0 || !(expr.parts[0] instanceof SExpr)) {
            return undefined
        }

        console.log('notes', expr)
        const notesExpr = expr.parts[0]

        let msg: string | undefined = undefined
        let sev: string | undefined = undefined
        let loc: CompileLocation | undefined = undefined

        for (let ndx = 0; ndx < notesExpr.parts.length; ndx += 2) {
            const name = this.getNameString(notesExpr.parts[ndx])

            if (name === undefined) {
                continue
            }

            const value = notesExpr.parts[ndx + 1]
            if (name === 'message') {
                msg = exprToString(value)
            } else if (name === 'severity') {
                sev = this.getNameString(value)
            } else if (name === 'location') {
                loc = this.parseLocation(value)
            }
        }

        return msg === undefined || sev === undefined || loc === undefined ? undefined : new CompileNotes(msg, sev, loc)
    }

    static parseLocation(expr: Expr) {
        if (!(expr instanceof SExpr)) {
            return undefined
        }

        let file: string | undefined = undefined
        let position: number | undefined = undefined

        for (const part of expr.parts) {
            if (!(part instanceof SExpr) || part.parts.length !== 2) {
                continue
            }

            const name = this.getNameString(part.parts[0])

            if (name === 'file') {
                file = exprToString(part.parts[1]) ?? ''
            } else if (name === 'position') {
                position = exprToNumber(part.parts[1]) ?? 0
            }
        }

        if (typeof file === 'string') {
            const converted = convert(file)
            if (typeof converted === 'string') {
                file = converted
            }
        }

        return file === undefined || position === undefined ? undefined : { file, position }
    }

    static getNameString(expr: Expr): string | undefined {
        const nameStr = exprToString(expr)

        if (nameStr === undefined) {
            return undefined
        }

        const name = convert(nameStr)

        if (typeof name != 'string') {
            return undefined
        }

        return name.toLowerCase()
    }
}
