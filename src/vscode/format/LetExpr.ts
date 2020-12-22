import { types } from '../../lisp'
import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, setTarget, State, withIncIndent, withIndent } from './Utils'
import { WrappedExpr } from './WrappedExpr'

export class LetExpr extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.consumeToken()
        if (isExprEnd(curToken)) {
            return
        }

        setTarget(this.state, curToken!, ' ')

        withIndent(this.state, this.state.lineLength, () => this.formatBindClause())

        withIncIndent(this.state, this.state.options.indentWidth, () => {
            curToken = this.peekToken()

            while (!isExprEnd(curToken)) {
                this.addLineIndent(curToken!)
                this.consumeExpr()

                curToken = this.peekToken()
            }
        })
    }

    private formatBindClause() {
        const expr = new WrappedExpr(this.state, new BindClause(this.state))
        this.formatExpr(expr)
    }
}

class BindClause extends ExprFormatter {
    first: boolean = true

    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.peekToken()

        if (curToken?.token.type !== types.OPEN_PARENS) {
            this.consumeRest()
            return
        }

        if (!this.first) {
            this.addLineIndent(curToken!)
        }

        withIndent(this.state, this.state.lineLength, () => {
            const expr = new WrappedExpr(this.state, new BindPair(this.state))
            this.formatExpr(expr)
        })

        this.first = false
    }
}

class BindPair extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        this.formatPair(() => {
            withIndent(this.state, this.state.lineLength, () => {
                this.consumeExpr()
            })
        })
    }
}
