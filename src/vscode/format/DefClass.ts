import { Expr } from './Expr'
import { ExprFormatter } from './ExprFormatter'
import { SlotListExpr } from './SlotListExpr'
import { isExprEnd, setTarget, State, withIncIndent } from './Utils'
import { WrappedExpr } from './WrappedExpr'

export class DefClass extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.consumeToken()
        if (isExprEnd(curToken)) {
            return
        }

        if (!this.eatExpr()) {
            return
        }

        if (!this.eatExpr()) {
            return
        }

        curToken = this.peekToken()
        withIncIndent(this.state, this.state.options.indentWidth, () => {
            this.formatSlots()
            curToken = this.peekToken()

            while (!isExprEnd(curToken)) {
                this.addLineIndent(curToken!)

                const expr = new Expr(this.state)
                this.formatExpr(expr)

                curToken = this.peekToken()
            }
        })
    }

    eatExpr(): boolean {
        let curToken = this.peekToken()
        if (isExprEnd(curToken)) {
            return false
        }

        setTarget(this.state, curToken!, ' ')
        this.consumeExpr()

        curToken = this.peekToken()
        if (isExprEnd(curToken)) {
            return false
        }

        return true
    }

    formatSlots() {
        let curToken = this.peekToken()
        if (isExprEnd(curToken)) {
            return
        }

        this.addLineIndent(curToken!)

        const wrapped = new WrappedExpr(this.state, new SlotListExpr(this.state))
        this.formatExpr(wrapped)
    }
}
