import * as event from '../event'
import { Atom, exprToString } from '../../lisp'
import { format, isString } from 'util'
import { convert } from '../SwankUtils'

export class DocSymbol {
    doc: string

    constructor(doc: string) {
        this.doc = doc
    }

    static parse(event: event.Return): DocSymbol | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof Atom)) {
            throw new Error(`DocSymbol invalid event ${format(event)}`)
        }

        const doc = exprToString(payload)
        const converted = convert(doc ?? '')

        return isString(converted) ? new DocSymbol(converted) : undefined
    }
}
