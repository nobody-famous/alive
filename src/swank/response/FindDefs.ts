import { Expr, exprToString, SExpr } from '../../lisp'
import { Return } from '../event'
import { plistToObj } from '../SwankUtils'
import { Location } from '../Types'

export class FindDefs {
    locs: Location[]

    constructor(locs: Location[]) {
        this.locs = locs
    }

    static parse(event: Return): FindDefs | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof SExpr)) {
            return new FindDefs([])
        }

        const locs: Location[] = []
        for (const def of payload.parts) {
            if (!(def instanceof SExpr) || def.parts.length < 2) {
                continue
            }

            const label = exprToString(def.parts[0])
            const infoExpr = def.parts[1] as SExpr
            const loc = this.parseLocation(infoExpr.parts)

            if (loc !== undefined) {
                locs.push(loc)
            }
        }

        return new FindDefs(locs)
    }

    static parseLocation(exprs: Expr[]): Location | undefined {
        if (exprs.length < 2) {
            return undefined
        }

        const label = exprToString(exprs[0])
        if (label === undefined || label.toUpperCase() !== ':LOCATION') {
            return undefined
        }

        const loc: Location = {
            file: '',
            position: 0,
            snippet: '',
        }

        for (let ndx = 1; ndx < exprs.length; ndx += 1) {
            if (!(exprs[ndx] instanceof SExpr)) {
                continue
            }

            const entryExpr = exprs[ndx] as SExpr
            const entry = plistToObj(entryExpr.parts)

            if (entry === undefined) {
                continue
            }

            for (const [key, value] of Object.entries(entry)) {
                if (typeof value !== 'string') {
                    continue
                }

                if (key.toUpperCase() === 'FILE') {
                    loc.file = value
                } else if (key.toUpperCase() === 'POSITION') {
                    const n = parseInt(value)
                    loc.position = n
                } else if (key.toUpperCase() === 'SNIPPET') {
                    loc.snippet = value
                }
            }
        }

        return loc
    }
}
