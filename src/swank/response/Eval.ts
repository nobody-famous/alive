import { Atom, exprToString, isString, types } from '../../lisp'
import { Return } from '../event/Return'
import { convert } from '../SwankUtils'

export class Eval {
    result?: string[]

    constructor(result: string[] | undefined) {
        this.result = result
    }

    static parse(event: Return): Eval | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof Atom)) {
            return undefined
        }

        if (payload.type !== types.STRING) {
            return new Eval(undefined)
        }

        const output = exprToString(payload)
        if (output === undefined) {
            return undefined
        }

        const converted = convert(output)
        if (!isString(converted)) {
            return undefined
        }

        return new Eval([converted as string])
    }
}
