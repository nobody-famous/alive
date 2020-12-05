import { types } from '../../lisp'
import { DefClass } from './DefClass'
import { DefPackage } from './DefPackage'
import { Defun } from './Defun'
import { ExprFormatter } from './ExprFormatter'
import { FormatToken } from './FormatToken'
import { IfExpr } from './IfExpr'
import { ListExpr } from './ListExpr'
import { Loop } from './Loop'
import { isExprEnd, State } from './Utils'

export class SExpr extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.consumeToken('(')

        if (curToken === undefined) {
            return
        }

        while (!isExprEnd(curToken)) {
            this.processToken(curToken!)

            curToken = this.peekToken()
            if (!isExprEnd(curToken)) {
                this.addLineIndent(curToken!)
            }
        }

        this.formatCloseParen()
        this.consumeToken(')')
    }

    private processToken(curToken: FormatToken) {
        switch (curToken.token.type) {
            case types.DEFPACKAGE:
                this.formatExpr(new DefPackage(this.state))
                break
            case types.DEFUN:
            case types.DEFMACRO:
            case types.DEFMETHOD:
                this.formatExpr(new Defun(this.state))
                break
            case types.DEFCLASS:
            case types.DEFINE_CONDITION:
                this.formatExpr(new DefClass(this.state))
                break
            case types.LOOP:
                this.formatExpr(new Loop(this.state))
                break
            case types.SPECIAL:
                this.formatSpecial(curToken)
                break
            case types.CLOSE_PARENS:
                break
            default:
                this.formatExpr(new ListExpr(this.state))
        }
    }

    private formatSpecial(curToken: FormatToken) {
        const name = curToken.token.text.toUpperCase()

        switch (name) {
            case 'IF':
            case 'WHEN':
            case 'UNLESS':
                this.formatExpr(new IfExpr(this.state))
                break
            default:
                this.formatExpr(new ListExpr(this.state))
        }
    }
}