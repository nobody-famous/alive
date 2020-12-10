import { types } from '../../lisp'
import { ExprFormatter } from './ExprFormatter'
import { LambdaExpr } from './LambdaExpr'
import { isExprEnd, setTarget, State, withIncIndent, withIndent } from './Utils'

export class Flet extends ExprFormatter {
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
        let first = true

        this.wrappedParens(() => {
            let curToken = this.peekToken()

            if (curToken?.token.type !== types.OPEN_PARENS) {
                this.consumeRest()
                return
            }

            if (!first) {
                this.addLineIndent(curToken!)
            }

            withIndent(this.state, this.state.lineLength, () => {
                this.wrappedParens(() => this.formatLambda())
            })

            first = false
        })
    }

    private consumeRest() {
        let curToken = this.peekToken()

        while (!isExprEnd(curToken)) {
            this.consumeExpr()
            curToken = this.peekToken()
        }
    }

    private formatLambda() {
        const expr = new LambdaExpr(this.state)
        this.formatExpr(expr)
    }
}
