import { Atom, valueToString } from '../../lisp'
import { convert } from '../SwankUtils'

export class Eval {
    result: string[]

    constructor(result: string[]) {
        this.result = result
    }

    static parse(data: unknown): Eval | undefined {
        if (!Array.isArray(data)) {
            return undefined
        }

        const lines = []
        for (const item of data) {
            const expr = item as Atom
            const line = expr.value !== undefined ? valueToString(expr.value) : undefined

            if (line !== undefined) {
                const converted = convert(line)
                lines.push(`${converted}`)
            }
        }

        return new Eval(lines)
    }
}
