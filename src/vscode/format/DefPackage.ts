import { types } from '../../lisp'
import { DefPkgList } from './DefPkgList'
import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, setTarget, State, withIncIndent } from './Utils'

export class DefPackage extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.consumeToken()

        if (curToken === undefined) {
            return
        }

        setTarget(this.state, curToken, ' ')

        this.consumeToken()

        withIncIndent(this.state, this.state.options.indentWidth, () => {
            this.defPkgKids()
        })
    }

    defPkgKids() {
        let curToken = this.peekToken()
        while (!isExprEnd(curToken)) {
            this.defPkgKid()

            curToken = this.peekToken()
        }
    }

    defPkgKid() {
        const curToken = this.peekToken()
        if (curToken === undefined) {
            return
        }

        this.addLineIndent(curToken)

        if (curToken.token.type === types.OPEN_PARENS) {
            const expr = new DefPkgList(this.state)
            this.formatExpr(expr)
            return
        }

        this.consumeToken()
    }
}
