import { Token, Lexer, types } from '../../lisp'

export class Parser {
    lex: Lexer
    curNdx: number
    tokens: Token[]
    parens: Token[]
    unclosedString?: Token
    mismatchedBar?: Token

    constructor(text: string, tokens: Token[]) {
        this.lex = new Lexer(text)
        this.curNdx = 0
        this.tokens = tokens
        this.parens = []
        this.unclosedString = undefined
        this.mismatchedBar = undefined
    }

    parse() {
        this.curNdx = 0

        while (true) {
            this.skipWS()
            if (this.peek() === undefined) {
                break
            }

            this.expr()
        }

        return this.tokens
    }

    expr() {
        const token = this.peek()
        if (token === undefined) {
            return
        }

        if (token.type === types.OPEN_PARENS) {
            this.sexpr(token)
        } else if (token.type === types.CLOSE_PARENS) {
            token.type = types.MISMATCHED_CLOSE_PARENS
            this.consume()
        } else if (token.type === types.SINGLE_QUOTE || token.type === types.BACK_QUOTE) {
            this.quote()
        } else {
            this.consume()
        }
    }

    quote() {
        this.consumeNoSkip()

        const next = this.peek()
        if (next === undefined || next.type === types.WHITE_SPACE) {
            return
        }

        const start = this.curNdx
        this.expr()
        this.quoteItems(start, this.curNdx)
    }

    quoteItems(start: number, end: number) {
        for (let ndx = start; ndx < end; ndx += 1) {
            const token = this.tokens[ndx]

            if (token.type !== types.WHITE_SPACE) {
                token.type = types.QUOTED
            }
        }
    }

    sexpr(openParen: Token) {
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
                this.defun()
            } else if (next.type === types.QUOTE_FUNC) {
                this.quoteFn()
            } else if (next.type === types.IN_PACKAGE) {
                this.inPackage()
            } else if (next.type === types.DEFPACKAGE) {
                this.defPackage()
            } else {
                this.expr()
            }
        }
    }

    quoteFn() {
        this.consume()

        const start = this.curNdx
        this.expr()
        this.quoteItems(start, this.curNdx)
    }

    sexprCheckFunctionCall() {
        let next = this.peek()

        if (next === undefined) {
            throw new Error('sexprCheckFunctionCall SOMETHING IS WRONG')
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

    load() {
        const next = this.consume()
        while (next !== undefined && next.type !== types.CLOSE_PARENS) {
            this.consume()
        }
    }

    defPackage() {
        this.consume()
        this.skipWS()

        let token = this.peek()
        if (token?.type !== types.SYMBOL) {
            return
        }

        token.type = types.PACKAGE_NAME

        let next = this.consume()
        while (next !== undefined && next.type !== types.CLOSE_PARENS) {
            this.expr()
            next = this.peek()
        }
    }

    inPackage() {
        this.consume()
        this.skipWS()

        let token = this.peek()
        if (token?.type !== types.SYMBOL) {
            return
        }
        this.consume()

        token.type = types.PACKAGE_NAME
    }

    defun() {
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

        this.paramList()

        if (this.peek() === undefined) {
            return
        }

        let next = this.peek()
        while (next !== undefined && next.type !== types.CLOSE_PARENS) {
            this.expr()
            next = this.peek()
        }
    }

    paramList() {
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

            next.type = types.PARAMETER
            next = this.consume()
        }
    }

    skipWS() {
        let next = this.peek()
        while (next !== undefined && next.type === types.WHITE_SPACE) {
            next = this.consume()
        }
    }

    peek(): Token | undefined {
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

    consumeNoSkip() {
        if (this.curNdx >= this.tokens.length) {
            return
        }

        this.curNdx += 1
    }

    consume(): Token | undefined {
        this.consumeNoSkip()
        this.skipWS()

        return this.peek()
    }
}
