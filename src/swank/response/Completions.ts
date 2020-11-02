import { Return } from '../event'
import { SExpr, exprToString, exprToStringArray } from '../../lisp'

export class Completions {
    strings: string[]
    lcp: string //Longest Common Prefix

    constructor(strings: string[], lcp: string) {
        this.strings = strings
        this.lcp = lcp
    }

    static parse(event: Return): Completions | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof SExpr) || payload.parts.length !== 2) {
            return undefined
        }

        const strings = exprToStringArray(payload.parts[0])
        const longestCommon = exprToString(payload.parts[1])

        if (strings === undefined || longestCommon === undefined) {
            return undefined
        }

        return new Completions(strings, longestCommon)
    }
}
