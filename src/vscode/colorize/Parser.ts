import { type } from 'os'
import { Token, Lexer, types } from '../../lisp'

export class Parser {
    lex: Lexer
    tokens: Token[]
    unclosedString?: Token
    mismatchedBar?: Token

    curNdx: number = 0
    parens: Token[] = []

    constructor(text: string, tokens: Token[]) {
        this.lex = new Lexer(text)
        this.tokens = tokens
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

        for (const token of this.tokens) {
            if (token.quoted || token.backquoted) {
                token.type = types.QUOTED
            }
        }

        return this.tokens
    }

    private parentQuoted(): boolean {
        if (this.parens.length === 0) {
            return false
        }

        const parent = this.parens[this.parens.length - 1]

        return parent.backquoted || parent.quoted
    }

    private expr() {
        const token = this.peek()
        if (token === undefined) {
            return
        }

        if (token.type === types.OPEN_PARENS) {
            this.sexpr(token)
        } else if (token.type === types.CLOSE_PARENS) {
            token.type = types.MISMATCHED_CLOSE_PARENS
            this.consume()
        } else if (token.type === types.BACK_QUOTE) {
            this.quote(true)
        } else if (token.type === types.SINGLE_QUOTE) {
            this.quote(false)
        } else if (token.type === types.COMMA) {
            this.comma()
        } else {
            this.consume()
        }
    }

    private comma() {
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

        this.expr()
    }

    private quote(backquote: boolean) {
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

        this.expr()
    }

    private quoteItems(start: number, end: number) {
        for (let ndx = start; ndx < end; ndx += 1) {
            const token = this.tokens[ndx]

            if (token.type !== types.WHITE_SPACE) {
                token.type = types.QUOTED
            }
        }
    }

    private sexpr(openParen: Token) {
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

    private quoteFn() {
        this.consume()

        const start = this.curNdx
        this.expr()
        this.quoteItems(start, this.curNdx)
    }

    private sexprCheckFunctionCall() {
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

    private load() {
        const next = this.consume()
        while (next !== undefined && next.type !== types.CLOSE_PARENS) {
            this.consume()
        }
    }

    private defPackage() {
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

    private defun() {
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

    private paramList() {
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
