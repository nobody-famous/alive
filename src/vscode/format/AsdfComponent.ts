import { AsdfBody } from './AsdfBody'
import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, setTarget, State, withIncIndent } from './Utils'

export class AsdfComponent extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.peekToken()
        let first = true

        while (!isExprEnd(curToken)) {
            if (first) {
                setTarget(this.state, curToken!, '')
            } else {
                this.addLineIndent(curToken!)
            }

            const key = this.formatKey()

            if (key === ':MODULE') {
                this.formatModule()
                curToken = this.peekToken()
            } else {
                this.consumeExpr()
                this.formatValue()
            }

            curToken = this.peekToken()
            first = false
        }
    }

    private formatKey(): string | undefined {
        let curToken = this.peekToken()
        if (isExprEnd(curToken)) {
            return
        }

        return curToken?.token.text.toUpperCase()
    }

    private formatValue() {
        const curToken = this.peekToken()

        if (!isExprEnd(curToken)) {
            setTarget(this.state, curToken!, ' ')
        }

        this.consumeExpr()
    }

    private formatModule() {
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

        withIncIndent(this.state, this.state.options.indentWidth, () => {
            const expr = new AsdfBody(this.state)
            this.formatExpr(expr)
        })
    }
}
