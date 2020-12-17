import { types } from '../../lisp'
import { Expr } from './Expr'
import { ExprFormatter } from './ExprFormatter'
import { countNewLines, isExprEnd, setTarget, State, withIncIndent, withIndent } from './Utils'
import { WrappedExpr } from './WrappedExpr'

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

        this.consumeExpr()
        curToken = this.peekToken()

        if (isExprEnd(curToken)) {
            return
        }

        if (curToken?.token.type == types.OPEN_PARENS) {
            setTarget(this.state, curToken!, ' ')

            withIndent(this.state, this.state.lineLength, () => {
                const expr = new WrappedExpr(this.state, new ArgsList(this.state))
                this.formatExpr(expr)
            })
        }

        let count = 0
        withIncIndent(this.state, this.state.options.indentWidth, () => {
            curToken = this.peekToken()

            while (!isExprEnd(curToken)) {
                this.addLineIndent(curToken!)

                const expr = new Expr(this.state)
                this.formatExpr(expr)

                curToken = this.peekToken()
                count += 1
            }
        })
    }
}

class ArgsList extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.peekToken()
        let first = true

        while (!isExprEnd(curToken)) {
            const count = countNewLines(curToken!.before.existing)

            if (count > 0) {
                this.addLineIndent(curToken!)
            } else {
                setTarget(this.state, curToken!, first ? '' : ' ')
            }

            this.consumeExpr()

            curToken = this.peekToken()
            first = false
        }
    }
}
