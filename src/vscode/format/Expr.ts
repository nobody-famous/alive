import { types } from '../../lisp'
import { ExprFormatter } from './ExprFormatter'
import { SExpr } from './SExpr'
import { countNewLines, setTarget, State, withIndent } from './Utils'

export class Expr extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        const curToken = this.peekToken()
        if (curToken === undefined) {
            return
        }

        switch (curToken.token.type) {
            case types.OPEN_PARENS:
                return this.formatSExpr()
            case types.BACK_QUOTE:
            case types.SINGLE_QUOTE:
                return this.formatQuote()
            case types.POUND_SEQ:
                return this.formatPoundSeq()
            default:
                this.consumeToken()
        }
    }

    formatPoundSeq() {
        const expr = new PoundExpr(this.state)
        this.doFormat(expr)
    }

    formatQuote() {
        const quote = this.peekToken()
        const startPos = this.state.lineLength

        this.consumeToken()

        let curToken = this.peekToken()
        let openCount = 0

        if (quote === undefined || curToken === undefined) {
            return
        }

        if (curToken.token.type !== types.OPEN_PARENS) {
            this.consumeToken()
            return
        }

        while (true) {
            if (curToken === undefined) {
                break
            }

            const diff = curToken.token.start.character - quote.token.start.character
            this.copyExistingWS(curToken, startPos + diff)

            if (curToken?.token.type === types.OPEN_PARENS) {
                openCount += 1
            } else if (curToken?.token.type === types.CLOSE_PARENS) {
                openCount -= 1
                if (openCount === 0) {
                    this.consumeToken()
                    break
                }
            }

            curToken = this.consumeToken()
        }
    }

    formatSExpr() {
        const sexpr = new SExpr(this.state)

        this.doFormat(sexpr)
    }

    doFormat(expr: ExprFormatter) {
        expr.format()

        if (expr.isMultiline) {
            this.isMultiline = true
        }

        if (expr.isOrigML) {
            this.isOrigML = true
        }
    }
}

class PoundExpr extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.peekToken()

        if (curToken === undefined) {
            return
        }

        const text = curToken.token.text

        this.consumeToken()

        if (!text.startsWith('#+') && !text.startsWith('#-')) {
            return
        }

        curToken = this.peekToken()
        if (curToken === undefined) {
            return
        }

        if (countNewLines(curToken.before.existing) > 0) {
            this.addLineIndent(curToken)
        } else {
            setTarget(this.state, curToken, ' ')
        }

        withIndent(this.state, this.state.lineLength, () => {
            this.consumeExpr()
        })
    }
}
