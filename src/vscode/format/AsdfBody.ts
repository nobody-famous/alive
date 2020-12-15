import { AsdfComponentList } from './AsdfComponentList'
import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, setTarget, State, withIndent } from './Utils'
import { WrappedExpr } from './WrappedExpr'

export class AsdfBody extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.peekToken()

        while (!isExprEnd(curToken)) {
            const key = this.formatKey()

            if (key === ':COMPONENTS') {
                this.formatComponents()
            } else {
                this.formatValue()
            }

            curToken = this.peekToken()
        }
    }

    private formatKey(): string | undefined {
        let curToken = this.peekToken()
        if (isExprEnd(curToken)) {
            return
        }

        const key = curToken?.token.text

        this.addLineIndent(curToken!)
        this.consumeExpr()

        return key?.toUpperCase()
    }

    private formatComponents() {
        let curToken = this.peekToken()
        if (isExprEnd(curToken)) {
            return
        }

        setTarget(this.state, curToken!, ' ')

        withIndent(this.state, this.state.lineLength, () => {
            const expr = new WrappedExpr(this.state, new AsdfComponentList(this.state))
            this.formatExpr(expr)
        })
    }

    private formatValue() {
        let curToken = this.peekToken()
        if (isExprEnd(curToken)) {
            return
        }

        setTarget(this.state, curToken!, ' ')
        withIndent(this.state, this.state.lineLength, () => {
            this.consumeExpr()
        })
    }
}
