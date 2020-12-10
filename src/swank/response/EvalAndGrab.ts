import { Atom, exprToString, isString, SExpr } from '../../lisp'
import { Return } from '../event/Return'
import { convert } from '../SwankUtils'

export class EvalAndGrab {
    result: string[]

    constructor(result: string[]) {
        this.result = result
    }

    static parse(event: Return): EvalAndGrab | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof SExpr)) {
            return undefined
        }

        const lines: string[] = []
        for (const part of payload.parts) {
            const str = exprToString(part)

            if (str !== undefined) {
                const converted = convert(str)
                if (isString(converted)) {
                    lines.push(converted as string)
                }
            }
        }

        // const output = exprToString(payload)
        // if (output === undefined) {
        //     return undefined
        // }

        // const converted = convert(output)
        // if (!isString(converted)) {
        //     return undefined
        // }

        // return new EvalAndGrab([converted as string])

        return new EvalAndGrab(lines)
    }
}
