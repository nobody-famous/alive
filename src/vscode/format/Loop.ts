import { Expr } from './Expr'
import { ExprFormatter } from './ExprFormatter'
import { FormatToken } from './FormatToken'
import { countNewLines, isExprEnd, setTarget, State, withIndent } from './Utils'

const baseClauses = [
    'always',
    'append',
    'appending',
    'as',
    'collect',
    'collecting',
    'count',
    'counting',
    'do',
    'doing',
    'finally',
    'for',
    'if',
    'initially',
    'maximize',
    'maximizing',
    'minimize',
    'minimizing',
    'named',
    'nconc',
    'nconcing',
    'never',
    'sum',
    'summing',
    'thereis',
    'unless',
    'until',
    'when',
    'while',
    'with',
]

const clauses = [...baseClauses, ...baseClauses.map((i) => `:${i}`)]

export class Loop extends ExprFormatter {
    constructor(state: State) {
        super(state)
    }

    format() {
        let curToken = this.consumeToken('LOOP')
        if (isExprEnd(curToken)) {
            return
        }

        const align = this.state.lineLength + 1

        this.multilineCheck(align, () => this.formatBody())
    }

    formatBody() {
        let curToken = this.peekToken()

        let first = true
        let inFor = false

        while (!isExprEnd(curToken)) {
            if (this.isNamedClause('for', curToken!)) {
                inFor = true
            }

            if (!first && this.isMultiline && this.isClause(curToken)) {
                if (inFor && this.isNamedClause('do', curToken!)) {
                    setTarget(this.state, curToken!, ' ')
                } else {
                    this.addLineIndent(curToken!)
                }
            } else if (!this.isClause(curToken)) {
                if (countNewLines(curToken!.before.existing) > 0) {
                    this.addLineIndent(curToken!)
                } else {
                    setTarget(this.state, curToken!, ' ')
                }
            } else {
                setTarget(this.state, curToken!, ' ')
            }

            withIndent(this.state, this.state.lineLength, () => this.formatNextExpr(inFor))

            if (this.isClause(curToken) && !this.isNamedClause('for', curToken!)) {
                inFor = false
            }

            first = false
            curToken = this.peekToken()
        }
    }

    private formatNextExpr(inFor: boolean) {
        let curToken = this.peekToken()

        if (this.isNamedClause('do', curToken!)) {
            curToken = this.consumeToken()

            if (inFor) {
                const align = this.state.indent[this.state.indent.length - 2] + this.state.options.indentWidth ?? 0
                withIndent(this.state, align, () => this.formatDoBody(true))
            } else {
                withIndent(this.state, this.state.lineLength + 1, () => this.formatDoBody(false))
            }
        } else {
            const expr = new Expr(this.state)
            this.formatExpr(expr)
        }
    }

    private isNamedClause(target: string, curToken: FormatToken): boolean {
        const name = curToken.token.text.toLowerCase()

        return name === target || name === `:${target}`
    }

    private formatDoBody(inFor: boolean) {
        let curToken = this.peekToken()
        let first = true

        while (!isExprEnd(curToken) && !this.isClause(curToken)) {
            if (first && !inFor) {
                setTarget(this.state, curToken!, ' ')
            } else {
                this.addLineIndent(curToken!)
            }

            const expr = new Expr(this.state)
            this.formatExpr(expr)

            first = false
            curToken = this.peekToken()
        }
    }

    private isClause(curToken: FormatToken | undefined): boolean {
        const text = curToken?.token.text.toLowerCase()

        return text !== undefined && clauses.includes(text)
    }
}
