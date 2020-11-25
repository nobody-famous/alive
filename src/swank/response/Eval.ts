import { Atom, exprToString, isString } from '../../lisp'
import { Return } from '../event/Return'
import { convert } from '../SwankUtils'

export class Eval {
    result: string[]

    constructor(result: string[]) {
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
