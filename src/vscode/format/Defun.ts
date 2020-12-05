import { Expr } from './Expr'
import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, setTarget, State, withIncIndent } from './Utils'

export class Defun extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.consumeToken()
        if (isExprEnd(curToken)) {
            return
        }

        setTarget(this.state, curToken!, ' ')

        let count = 0
        withIncIndent(this.state, this.state.options.indentWidth, () => {
            while (!isExprEnd(curToken)) {
                if (count > 1) {
                    this.addLineIndent(curToken!)
                } else {
                    setTarget(this.state, curToken!, ' ')
                }

                const expr = new Expr(this.state)
                this.formatExpr(expr)

                curToken = this.peekToken()
                count += 1
            }
        })
    }
}
