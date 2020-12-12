import { AsdfBody } from './AsdfBody'
import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, setTarget, State, withIncIndent } from './Utils'

export class DefSystem extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.consumeToken()
        if (isExprEnd(curToken)) {
            return
        }

        setTarget(this.state, curToken!, ' ')

        curToken = this.consumeToken()

        withIncIndent(this.state, this.state.options.indentWidth, () => {
            const expr = new AsdfBody(this.state)
            this.formatExpr(expr)
        })
    }
}
