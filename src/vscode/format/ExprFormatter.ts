import { EOL } from 'os'
import * as vscode from 'vscode'
import { types } from '../../lisp'
import { Expr } from './Expr'
import { FormatToken } from './FormatToken'
import { countNewLines, isExprEnd, setTarget, State, withIncIndent, withIndent } from './Utils'

interface Snapshot {
    ndx: number
    indent: number[]
    mlBefore: boolean
    lineLen: number
}

export abstract class ExprFormatter {
    state: State
    isMultiline: boolean = false
    isOrigML: boolean = false
    isTopLevel: boolean = false

    constructor(state: State) {
        this.state = state
    }

    abstract format(): void

    peekToken(): FormatToken | undefined {
        return this.state.tokenList.peek()
    }

    prevToken(): FormatToken | undefined {
        return this.state.tokenList.prev()
    }

    consumeToken(expected?: string): FormatToken | undefined {
        const curToken = this.peekToken()

        if (expected !== undefined) {
            if (expected !== curToken?.token.text) {
                vscode.window.showErrorMessage(`TOKEN "${expected}" !== "${curToken?.token.text}"`)
            }
        }

        if (curToken !== undefined && countNewLines(curToken.before.existing) > 0) {
            this.isOrigML = true
        }

        this.state.lineLength += curToken?.token.text.length ?? 0

        return this.state.tokenList.consume()
    }

    consumeExpr() {
        const expr = new Expr(this.state)
        this.formatExpr(expr)
    }

    formatExpr(expr: ExprFormatter) {
        expr.format()

        if (expr.isMultiline) {
            this.isMultiline = true
        }

        if (expr.isOrigML) {
            this.isOrigML = true
        }
    }

    formatCloseParen() {
        const paren = this.peekToken()

        if (!isExprEnd(paren)) {
            return
        }

        const opt = this.state.options.closeParenOwnLine
        const prev = this.state.tokenList.prev()

        if (this.closeOwnLine(opt) || prev?.token.type === types.COMMENT) {
            if (prev?.onOwnLine) {
                paren!.onOwnLine = true
            }

            if (prev?.token.type !== types.CLOSE_PARENS || opt === 'always' || !prev.onOwnLine) {
                this.addLineIndent(paren!)
                paren!.onOwnLine = true
            }
        }
    }

    closeOwnLine(opt: string): boolean {
        return opt === 'always' || (opt === 'multiline' && this.isMultiline)
    }

    snapshot(): Snapshot {
        return {
            ndx: this.state.tokenList.ndx,
            indent: [...this.state.indent],
            mlBefore: this.isMultiline,
            lineLen: this.state.lineLength,
        }
    }

    restore(ss: Snapshot) {
        this.state.tokenList.ndx = ss.ndx
        this.state.indent = ss.indent
        this.state.lineLength = ss.lineLen
    }

    multilineCheck(startAlign: number, fn: () => void) {
        const ss = this.snapshot()

        fn()

        if (ss.mlBefore || this.isMultiline || this.isOrigML) {
            this.restore(ss)
            this.isMultiline = true

            withIndent(this.state, startAlign, () => {
                fn()
            })
        }
    }

    addLineIndent(token: FormatToken) {
        const numNewLines = countNewLines(token.before.existing)
        let count = 0

        switch (numNewLines) {
            case 0:
                count = 1
                break
            case 1:
                count = 1
                break
            default:
                count = 2
        }

        token.before.target = EOL.repeat(count)
        token.onOwnLine = true

        this.state.lineLength = 0
        this.isMultiline = true
        this.addIndent(token)
    }

    copyExistingWS(token: FormatToken, diff: number = 0): number {
        const count = countNewLines(token.before.existing)

        if (count > 0) {
            token.before.target = EOL.repeat(count)
            token.before.target += ' '.repeat(diff)

            this.isMultiline = true
            this.state.lineLength = diff
        } else {
            token.before.target = token.before.existing
            this.state.lineLength += token.before.target.length
        }

        return count
    }

    endingSpaces(text: string): string {
        let spaces = ''

        for (let ndx = text.length - 1; ndx >= 0; ndx -= 1) {
            if (text.charAt(ndx) !== ' ') {
                break
            }

            spaces += ' '
        }

        return spaces
    }

    wrappedParens(fn: (curToken: FormatToken) => void) {
        let curToken = this.peekToken()
        if (curToken === undefined || curToken.token.type !== types.OPEN_PARENS) {
            return
        }

        curToken = this.consumeToken('(')

        withIncIndent(this.state, 1, () => {
            while (!isExprEnd(curToken)) {
                fn(curToken!)
                curToken = this.peekToken()
            }
        })

        this.formatCloseParen()
        this.consumeToken(')')
    }

    formatPair(fn: () => void) {
        let curToken = this.peekToken()

        curToken = this.consumeToken()
        if (isExprEnd(curToken)) {
            return
        }

        setTarget(this.state, curToken!, ' ')

        fn()
    }

    consumeRest() {
        let curToken = this.peekToken()

        while (!isExprEnd(curToken)) {
            this.consumeExpr()
            curToken = this.peekToken()
        }
    }

    private addIndent(token: FormatToken) {
        const stack = this.state.indent
        const indent = stack[stack.length - 1]

        token.before.target += ' '.repeat(indent)
        this.state.lineLength += indent
    }
}
