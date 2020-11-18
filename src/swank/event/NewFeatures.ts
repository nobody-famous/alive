import { SwankEvent, SwankRawEvent } from './SwankEvent'
import { SExpr, exprToStringArray } from '../../lisp'

export class NewFeatures implements SwankEvent {
    op: string
    features: string[]

    constructor(features: string[]) {
        this.op = ':NEW-FEATURES'
        this.features = features
    }

    static from(event: SwankRawEvent): NewFeatures | undefined {
        if (event.payload.length === 0 || !(event.payload[0] instanceof SExpr)) {
            return undefined
        }

        const expr = event.payload[0] as SExpr
        const values = exprToStringArray(expr)

        return values !== undefined ? new NewFeatures(values) : undefined
    }
}
