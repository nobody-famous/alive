import { ExprFormatter } from './ExprFormatter'
import { State } from './Utils'

export class WrappedExpr extends ExprFormatter {
    expr: ExprFormatter

    constructor(state: State, expr: ExprFormatter) {
        super(state)
        this.expr = expr
    }

    format() {
        this.wrappedParens(() => this.formatExpr(this.expr))
    }
}
