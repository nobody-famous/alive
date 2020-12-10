import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, setTarget, State, withIndent } from './Utils'

export class SlotExpr extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.peekToken()

        if (isExprEnd(curToken)) {
            return
        }

        let ndx = 0
        let align = 0

        while (!isExprEnd(curToken)) {
            if (ndx === 1) {
                setTarget(this.state, curToken!, ' ')
                align = this.state.lineLength
                this.formatPair(() => this.consumeExpr())
            } else if (ndx > 1) {
                withIndent(this.state, align, () => {
                    this.addLineIndent(curToken!)
                    this.formatPair(() => this.consumeExpr())
                })
            } else {
                this.consumeToken()
            }

            ndx += 1
            curToken = this.peekToken()
        }
    }
}
