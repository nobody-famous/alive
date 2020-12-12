import { types } from '../../lisp'
import { AsdfComponent } from './AsdfComponent'
import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, setTarget, State, withIndent } from './Utils'
import { WrappedExpr } from './WrappedExpr'

export class AsdfComponentList extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.peekToken()
        let first = true

        while (!isExprEnd(curToken)) {
            if (first) {
                setTarget(this.state, curToken!, '')
            } else {
                this.addLineIndent(curToken!)
            }

            if (curToken?.token.type === types.OPEN_PARENS) {
                withIndent(this.state, this.state.lineLength, () => {
                    const expr = new WrappedExpr(this.state, new AsdfComponent(this.state))
                    this.formatExpr(expr)
                })
            } else {
                this.consumeExpr()
            }

            curToken = this.peekToken()
            first = false
        }
    }
}
