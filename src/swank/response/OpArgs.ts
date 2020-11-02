import { Atom, exprToString } from '../../lisp'
import { Return } from '../event'
import { convert } from '../SwankUtils'

export class OpArgs {
    desc: string

    constructor(desc: string) {
        this.desc = desc
    }

    static parse(event: Return): OpArgs | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof Atom)) {
            return undefined
        }

        const args = exprToString(payload)
        let value: string = args ?? ''

        if (args !== undefined) {
            const converted = convert(args)

            value = typeof converted === 'string' ? converted : args
        }

        return new OpArgs(value)
    }
}
