import { Expr, exprToNumber, exprToString, SExpr } from '../../lisp'
import { CompileLocation } from '../../vscode/Types'
import { convert } from '../SwankUtils'

export class CompileNote {
    message: string
    severity: string
    location: CompileLocation

    constructor(message: string, severity: string, location: CompileLocation) {
        this.message = message
        this.severity = severity
        this.location = location
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

    static parseLocation(expr: Expr) {
        if (!(expr instanceof SExpr)) {
            return undefined
        }

        let file: string | undefined = undefined
        let startPosition: number | undefined = undefined

        for (const part of expr.parts) {
            if (!(part instanceof SExpr) || part.parts.length !== 2) {
                continue
            }

            const name = this.getNameString(part.parts[0])

            if (name === 'file') {
                file = exprToString(part.parts[1]) ?? ''
            } else if (name === 'position') {
                startPosition = exprToNumber(part.parts[1]) ?? 0
            }
        }

        if (typeof file === 'string') {
            const converted = convert(file)
            if (typeof converted === 'string') {
                file = converted
            }
        }

        return file === undefined || startPosition === undefined ? undefined : { file, startPosition, endPosition: startPosition }
    }

    static from(expr: SExpr): CompileNote | undefined {
        let msg: string | undefined = undefined
        let sev: string | undefined = undefined
        let loc: CompileLocation | undefined = undefined

        for (let ndx = 0; ndx < expr.parts.length; ndx += 2) {
            const name = this.getNameString(expr.parts[ndx])

            if (name === undefined) {
                continue
            }

            const value = expr.parts[ndx + 1]
            if (name === 'message') {
                msg = exprToString(value)
            } else if (name === 'severity') {
                sev = this.getNameString(value)
            } else if (name === 'location') {
                // loc = this.parseLocation(value)
            }
        }

        return msg === undefined || sev === undefined || loc === undefined ? undefined : new CompileNote(msg, sev, loc)
    }
}

export class CompileNotes {
    static from(expr: Expr): CompileNote[] {
        if (!(expr instanceof SExpr) || expr.parts.length === 0) {
            return []
        }

        const notes: CompileNote[] = []

        for (const part of expr.parts) {
            if (!(part instanceof SExpr)) {
                continue
            }

            const note = CompileNote.from(part as SExpr)

            if (note !== undefined) {
                notes.push(note)
            }
        }

        return notes
    }
}
