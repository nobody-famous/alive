import { Expr } from './Expr'
import { ExprFormatter } from './ExprFormatter'
import { isExprEnd, setTarget, State, withIndent } from './Utils'

export class IfExpr extends ExprFormatter {
    startCondAlign: number = 0

    constructor(state: State) {
        super(state)
    }

    format() {
        if (!this.processIfToken()) {
            return
        }

        if (!this.processCond()) {
            return
        }

        this.multilineCheck(this.startCondAlign, () => this.processBranches())
    }

    private processIfToken(): boolean {
        let token = this.peekToken()
        if (token === undefined) {
            return false
        }

        this.consumeToken('IF')
        return true
    }

    private processCond(): boolean {
        let curToken = this.peekToken()
        if (isExprEnd(curToken)) {
            return false
        }

        setTarget(this.state, curToken!, ' ')
        this.startCondAlign = this.state.lineLength

        withIndent(this.state, this.startCondAlign, () => {
            this.formatExpr(new Expr(this.state))
        })

        return true
    }

    private processBranches() {
        let curToken = this.peekToken()

        while (!isExprEnd(curToken)) {
            this.processBranch()
            curToken = this.peekToken()
        }
    }

    private processBranch() {
        let curToken = this.peekToken()
        if (isExprEnd(curToken)) {
            return
        }

        if (this.isMultiline) {
            this.addLineIndent(curToken!)
        } else {
            setTarget(this.state, curToken!, ' ')
        }

        this.formatExpr(new Expr(this.state))
    }
}
