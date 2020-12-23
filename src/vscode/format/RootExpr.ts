import { EOL } from 'os'
import { types } from '../../lisp'
import { Expr } from './Expr'
import { ExprFormatter } from './ExprFormatter'
import { countNewLines, State } from './Utils'

export class RootExpr extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.peekToken()

        while (curToken !== undefined) {
            const expr = new Expr(this.state)
            expr.format()

            curToken = this.peekToken()
            if (curToken === undefined) {
                break
            }

            const prev = this.prevToken()

            if (prev?.token.type !== types.COMMENT) {
                const count = countNewLines(curToken.before.existing)

                if (count <= 1) {
                    curToken.before.target = `${EOL}`
                } else {
                    curToken.before.target = `${EOL}${EOL}`
                }

                this.state.lineLength = 0
            } else {
                this.copyExistingWS(curToken)
            }
        }
    }
}
