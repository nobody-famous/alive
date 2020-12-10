import { types } from '../../lisp'
import { ExprFormatter } from './ExprFormatter'
import { SlotExpr } from './SlotExpr'
import { isExprEnd, State } from './Utils'
import { WrappedExpr } from './WrappedExpr'

export class SlotListExpr extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.peekToken()

        if (isExprEnd(curToken)) {
            return
        }

        let first = true

        while (!isExprEnd(curToken)) {
            if (!first) {
                this.addLineIndent(curToken!)
            }

            if (curToken!.token.type === types.OPEN_PARENS) {
                this.formatSlot()
            } else {
                this.consumeToken()
            }

            first = false
            curToken = this.peekToken()
        }
    }

    private formatSlot() {
        const wrapped = new WrappedExpr(this.state, new SlotExpr(this.state))
        this.formatExpr(wrapped)
    }
}
