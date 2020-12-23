import { Token, types } from '../../lisp'
import { Repl } from '../repl'

export class SemanticAnalyzer {
    tokens: Token[]
    repl?: Repl
    unclosedString?: Token
    mismatchedBar?: Token

    curNdx: number = 0
    parens: Token[] = []

    constructor(repl: Repl | undefined, tokens: Token[]) {
        this.repl = repl
        this.tokens = tokens
    }

    async analyze() {
        this.curNdx = 0

        while (true) {
            this.skipWS()
            if (this.peek() === undefined) {
                break
            }

            await this.expr()
        }

        for (const token of this.tokens) {
            if (token.quoted || token.backquoted) {
                token.type = types.QUOTED
            }
        }
    }

    private parentQuoted(): boolean {
        if (this.parens.length === 0) {
            return false
        }

        const parent = this.parens[this.parens.length - 1]

        return parent.backquoted || parent.quoted
    }

    private async expr() {
        const token = this.peek()
        if (token === undefined) {
            return
        }

        if (token.type === types.OPEN_PARENS) {
            await this.sexpr(token)
        } else if (token.type === types.CLOSE_PARENS) {
            token.type = types.MISMATCHED_CLOSE_PARENS
            this.consume()
        } else if (token.type === types.BACK_QUOTE) {
            await this.quote(true)
        } else if (token.type === types.SINGLE_QUOTE) {
            await this.quote(false)
        } else if (token.type === types.COMMA) {
            await this.comma()
        } else if (token.type === types.POUND_SEQ) {
            await this.pound()
        } else {
            this.consume()
        }
    }

    private async pound() {
        let cur = this.peek()

        if (cur === undefined) {
            return
        }

        this.consume()

        if (this.repl === undefined || !this.isReaderMacro(cur.text)) {
            return
        }

        const toEval = `(ignore-errors ${cur.text} t)`

        try {
            this.repl.setIgnoreDebug(true)
            const resp = await this.repl.eval(toEval)

            if (resp) {
                return
            }
        } catch (err) {
            cur.type = types.ERROR
            return
        } finally {
            this.repl.setIgnoreDebug(false)
        }

        cur.type = types.COMMENT

        this.commentOutExpr()
    }

    private commentOutExpr() {
        let cur = this.peek()

        if (cur === undefined) {
            return
        }

        if (cur.type !== types.OPEN_PARENS && cur.type !== types.SINGLE_QUOTE && cur.type !== types.BACK_QUOTE) {
            cur.type = types.COMMENT
            this.consume()
            return
        }

        while (cur.type === types.SINGLE_QUOTE || cur.type === types.BACK_QUOTE) {
            cur.type = types.COMMENT
            this.consumeNoSkip()

            cur = this.peek()
            if (cur === undefined || cur.type === types.WHITE_SPACE) {
                return
            }
        }

        if (cur === undefined || cur.type === types.WHITE_SPACE) {
            return
        }

        let count = 0
        while (cur !== undefined) {
            if (cur.type === types.OPEN_PARENS) {
                count += 1
            } else if (cur.type === types.CLOSE_PARENS) {
                count -= 1
            }

            cur.type = types.COMMENT
            this.consume()

            cur = this.peek()

            if (count === 0) {
                break
            }
        }
    }

    private isReaderMacro(text: string): boolean {
        return text.startsWith('#+') || text.startsWith('#-')
    }

    private async comma() {
        const cur = this.peek()

        if (cur === undefined) {
            return
        }

        cur.backquoted = false
        cur.quoted = false

        this.consumeNoSkip()

        const next = this.peek()
        if (next === undefined || next.type === types.WHITE_SPACE) {
            return
        }

        await this.expr()
    }

    private async quote(backquote: boolean) {
        this.consumeNoSkip()

        const next = this.peek()
        if (next === undefined || next.type === types.WHITE_SPACE) {
            return
        }

        if (backquote) {
            next.backquoted = true
        } else {
            next.quoted = true
        }

        await this.expr()
    }

    private quoteItems(start: number, end: number) {
        for (let ndx = start; ndx < end; ndx += 1) {
            const token = this.tokens[ndx]

            if (token.type !== types.WHITE_SPACE) {
                token.type = types.QUOTED
            }
        }
    }

    private async sexpr(openParen: Token) {
        this.parens.push(openParen)
        this.consume()

        if (this.peek() === undefined) {
            return
        }

        this.sexprCheckFunctionCall()

        while (true) {
            const next = this.peek()

            if (next === undefined) {
                const token = this.parens.pop()

                if (token !== undefined) {
                    token.type = types.MISMATCHED_OPEN_PARENS
                }

                break
            }

            if (next.type === types.CLOSE_PARENS) {
                this.parens.pop()
                this.consume()
                break
            }

            if (next.text === 'DEFUN') {
                await this.defun()
            } else if (this.isLambdaName(next.text)) {
                await this.lambda()
            } else if (next.type === types.QUOTE_FUNC) {
                await this.quoteFn()
            } else if (next.type === types.IN_PACKAGE) {
                next.type = types.MACRO
                await this.inPackage()
            } else if (next.type === types.DEFPACKAGE) {
                next.type = types.MACRO
                await this.defPackage()
            } else {
                await this.expr()
            }
        }
    }

    private isLambdaName(text: string): boolean {
        switch (text) {
            case 'LAMBDA':
            case 'DESTRUCTURING-BIND':
                return true
            default:
                return false
        }
    }

    private async quoteFn() {
        this.consume()

        const start = this.curNdx
        await this.expr()
        this.quoteItems(start, this.curNdx)
    }

    private sexprCheckFunctionCall() {
        let next = this.peek()

        if (next === undefined) {
            return
        }

        if (next.type === types.ID) {
            next.type = types.FUNCTION
            this.consume()
        } else if (next.type === types.PACKAGE_NAME) {
            next = this.consume()

            if (next === undefined) {
                return
            }

            if (next.type === types.SYMBOL) {
                next.type = types.FUNCTION
                this.consume()
            }
        }
    }

    private async defPackage() {
        this.consume()
        this.skipWS()

        let token = this.peek()
        if (token?.type !== types.SYMBOL) {
            return
        }

        token.type = types.PACKAGE_NAME

        let next = this.consume()
        while (next !== undefined && next.type !== types.CLOSE_PARENS) {
            await this.expr()
            next = this.peek()
        }
    }

    private inPackage() {
        this.consume()
        this.skipWS()

        let token = this.peek()
        if (token?.type !== types.SYMBOL) {
            return
        }
        this.consume()

        token.type = types.PACKAGE_NAME
    }

    private async lambda() {
        this.consume()

        let token = this.peek()
        if (token?.type !== types.OPEN_PARENS) {
            return
        }

        this.parens.push(token)
        this.consume()

        await this.paramList()

        let next = this.peek()

        while (next !== undefined && next.type !== types.CLOSE_PARENS) {
            await this.expr()
            next = this.peek()
        }
    }

    private async defun() {
        this.consume()

        let token = this.peek()
        if (token?.type !== types.ID) {
            return
        }

        token.type = types.FUNCTION
        this.consume()

        token = this.peek()
        if (token?.type !== types.OPEN_PARENS) {
            return
        }

        this.parens.push(token)
        this.consume()

        await this.paramList()

        if (this.peek() === undefined) {
            return
        }

        let next = this.peek()
        while (next !== undefined && next.type !== types.CLOSE_PARENS) {
            await this.expr()
            next = this.peek()
        }
    }

    private async paramList() {
        let parenCount = 0

        while (true) {
            let next = this.peek()

            if (next === undefined) {
                const parens = this.parens.pop()

                if (parens !== undefined) {
                    parens.type = types.MISMATCHED_OPEN_PARENS
                }

                return
            }

            if (next.type === types.CLOSE_PARENS) {
                if (parenCount === 0) {
                    this.parens.pop()
                    this.consume()
                    break
                }

                parenCount -= 1
            } else if (next.type === types.OPEN_PARENS) {
                parenCount += 1
            }

            if (next.type === types.POUND_SEQ) {
                await this.pound()
            } else {
                next.type = types.PARAMETER
            }

            next = this.consume()
        }
    }

    private skipWS() {
        let next = this.peek()
        while (next !== undefined && next.type === types.WHITE_SPACE) {
            next = this.consume()
        }
    }

    private peek(): Token | undefined {
        if (this.curNdx >= this.tokens.length) {
            return undefined
        }

        const token = this.tokens[this.curNdx]
        if (this.unclosedString === undefined && token.type === types.MISMATCHED_DBL_QUOTE) {
            this.unclosedString = token
        } else if (this.mismatchedBar === undefined && token.type === types.MISMATCHED_BAR) {
            this.mismatchedBar = token
        }

        return token
    }

    private consumeNoSkip() {
        if (this.curNdx >= this.tokens.length) {
            return
        }

        this.curNdx += 1
    }

    private consume(): Token | undefined {
        this.consumeNoSkip()
        this.skipWS()

        const token = this.peek()

        if (token !== undefined && this.parentQuoted()) {
            token.quoted = true
        }

        return token
    }
}
