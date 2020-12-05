import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, State, withIndent } from './Utils'

export class DefPkgList extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.consumeToken('(')

        if (curToken === undefined) {
            return
        }

        // Name
        if (!this.defPkgAtom('')) {
            return
        }

        const align = this.state.lineLength + 1

        // First item
        if (!this.defPkgAtom(' ')) {
            return
        }

        withIndent(this.state, align, () => {
            curToken = this.peekToken()

            while (!isExprEnd(curToken)) {
                this.addLineIndent(curToken!)
                curToken = this.consumeToken()
            }

            this.formatCloseParen()
            this.consumeToken(')')
        })
    }

    private defPkgAtom(target: string): boolean {
        let curToken = this.peekToken()
        if (curToken === undefined) {
            return false
        }

        curToken.before.target = target
        curToken = this.consumeToken()

        return true
    }
}
