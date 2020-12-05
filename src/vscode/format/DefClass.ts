import { types } from '../../lisp'
import { Expr } from './Expr'
import { ExprFormatter } from './ExprFormatter'
import { FormatToken } from './FormatToken'
import { isExprEnd, setTarget, State, withIncIndent, withIndent } from './Utils'

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

        let first = true
        this.wrappedParens((curToken: FormatToken) => {
            if (!first) {
                this.addLineIndent(curToken)
            }

            if (curToken.token.type === types.OPEN_PARENS) {
                this.formatSlot()
            } else {
                this.consumeToken()
            }

            first = false
        })
    }

    formatSlot() {
        let count = 0
        let align = 0

        this.wrappedParens((curToken: FormatToken) => {
            if (count === 1) {
                setTarget(this.state, curToken, ' ')
                align = this.state.lineLength
                this.formatPair()
            } else if (count > 1) {
                withIndent(this.state, align, () => {
                    this.addLineIndent(curToken)
                    this.formatPair()
                })
            } else {
                this.consumeToken()
            }

            count += 1
        })
    }
}
