import { Atom, Expr, exprToNumber, exprToString, SExpr } from '../../lisp'
import { Return } from '../event'
import { convert } from '../SwankUtils'
import { CompileNote, CompileNotes } from './CompileNotes'

export class CompileFile {
    notes: CompileNote[]
    success: boolean
    duration: number
    loaded: boolean
    faslFile: string

    constructor(notes: CompileNote[], success: boolean, duration: number, loaded: boolean, faslFile: string) {
        this.notes = notes
        this.success = success
        this.duration = duration
        this.loaded = loaded
        this.faslFile = faslFile
    }

    static parse(event: Return): CompileFile | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload
        if (!(payload instanceof SExpr) || payload.parts.length !== 6) {
            return undefined
        }

        const notes = CompileNotes.from(payload.parts[1])
        const success = exprToString(payload.parts[2]) ?? false
        const duration = exprToNumber(payload.parts[3]) ?? 0
        const loaded = exprToString(payload.parts[4]) ?? false
        const faslFile = exprToString(payload.parts[5]) ?? ''

        return new CompileFile(notes, success === 'T', duration ?? 0, loaded === 'T', faslFile)
    }

    static parseNotes(notes: Expr) {
        if (!(notes instanceof SExpr) || notes.parts.length === 0) {
            return []
        }

        const plist = notes.parts[0]
        if (!(plist instanceof SExpr) || plist.parts.length === 0) {
            return []
        }

        const convertStr = (expr: Expr) => {
            if (!(expr instanceof Atom)) {
                return
            }

            const keyStr = exprToString(expr)
            if (typeof keyStr !== 'string') {
                return
            }

            return convert(keyStr.toLowerCase())
        }

        for (let ndx = 0; ndx + 1 < plist.parts.length; ndx += 2) {
            const nameExpr = plist.parts[ndx]
            const valueExpr = plist.parts[ndx + 1]

            const key = convertStr(nameExpr)
            if (key === undefined) {
                continue
            }

            console.log('key', key)
            if (key === 'severity') {
                console.log(`severity: ${convertStr(valueExpr)}`)
            } else if (key === 'message') {
                console.log(`message: ${exprToString(valueExpr)}`)
            } else {
                console.log('value', valueExpr)
            }
        }
    }
}
