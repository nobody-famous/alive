import { Return } from '../event'
import { exprToStringArray, SExpr } from '../../lisp'

export class ListPackages {
    names: string[]

    constructor(names: string[]) {
        this.names = names
    }

    static parse(event: Return): ListPackages | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof SExpr)) {
            return undefined
        }

        const strings = exprToStringArray(payload)
        if (strings === undefined) {
            return undefined
        }

        return new ListPackages(strings)
    }
}
