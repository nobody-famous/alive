import { types } from '../../lisp'
import { BindExpr } from './BindExpr'
import { DefClass } from './DefClass'
import { DefPackage } from './DefPackage'
import { DefSystem } from './DefSystem'
import { Defun } from './Defun'
import { ExprFormatter } from './ExprFormatter'
import { Flet } from './Flet'
import { FormatToken } from './FormatToken'
import { IfExpr } from './IfExpr'
import { LambdaExpr } from './LambdaExpr'
import { LetExpr } from './LetExpr'
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
                this.formatSpecial(curToken)
        }
    }

    private formatSpecial(curToken: FormatToken) {
        const text = curToken.token.text.toUpperCase()
        const ndx = text.lastIndexOf(':')
        const name = ndx >= 0 ? text.substr(ndx + 1) : text

        switch (name) {
            case 'IF':
            case 'WHEN':
            case 'UNLESS':
                this.formatExpr(new IfExpr(this.state))
                break
            case 'LAMBDA':
            case 'RESTART-CASE':
            case 'HANDLER-CASE':
                this.formatExpr(new LambdaExpr(this.state))
                break
            case 'DESTRUCTURING-BIND':
                this.formatExpr(new BindExpr(this.state))
                break
            case 'LET':
            case 'LET*':
                this.formatExpr(new LetExpr(this.state))
                break
            case 'FLET':
            case 'LABELS':
                this.formatExpr(new Flet(this.state))
                break
            case 'DEFSYSTEM':
                this.formatExpr(new DefSystem(this.state))
                break
            default:
                this.formatExpr(new ListExpr(this.state))
        }
    }
}
