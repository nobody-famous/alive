import { ExprFormatter } from './ExprFormatter'
import { countNewLines, incIndent, isExprEnd, setTarget, State, withIncIndent } from './Utils'

export class LambdaExpr extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.consumeToken()
        if (isExprEnd(curToken)) {
            return
        }

        if (countNewLines(curToken!.before.existing) > 0) {
            withIncIndent(this.state, this.state.options.indentWidth * 2, () => {
                this.addLineIndent(curToken!)
                this.consumeExpr()
            })
        } else {
            setTarget(this.state, curToken!, ' ')
            this.consumeExpr()
        }

        const align = incIndent(this.state, this.state.options.indentWidth)
        this.multilineCheck(align, () => {
            curToken = this.peekToken()

            while (!isExprEnd(curToken)) {
                if (this.isMultiline) {
                    this.addLineIndent(curToken!)
                } else {
                    setTarget(this.state, curToken!, ' ')
                }
                this.consumeExpr()

                curToken = this.peekToken()
            }
        })
    }
}
