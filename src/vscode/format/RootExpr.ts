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

            expr.isTopLevel = true
            expr.format()

            curToken = this.peekToken()
            if (curToken === undefined) {
                break
            }

            const prev = this.prevToken()

            if (curToken.token.type === types.WHITE_SPACE) {
                const count = countNewLines(curToken.before.existing)
                const blanks = Math.min(1, count)

                curToken.before.target = `${EOL}`.repeat(blanks)
            } else if (curToken.token.type !== types.COMMENT && prev?.token.type !== types.COMMENT) {
                const count = countNewLines(curToken.before.existing)

                if (count <= 1) {
                    curToken.before.target = `${EOL}`
                } else {
                    const cfg = this.state.options.maxBlankLines + 1
                    const blanks = Math.min(cfg, count)

                    curToken.before.target = `${EOL}`.repeat(blanks)
                }

                this.state.lineLength = 0
            } else {
                this.copyExistingWS(curToken)
            }
        }
    }
}
