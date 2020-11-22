import * as vscode from 'vscode'
import { Position, Range, TextEdit, workspace } from 'vscode'
import { Token, types } from '../../lisp'
import { toVscodePos } from '../Utils'

const DEFAULT_INDENT = 3

interface Expr {
    open: Token
    alignNext: boolean
    indent?: number
    multiline: boolean
    isAligned: boolean
    isParamList: boolean
    defun?: { paramList: boolean }
    isLet?: boolean
    hasVarExpr?: boolean
}

class FormatterToken extends Token {
    ndx: number

    constructor(type: number, start: Position, end: Position, text: string, ndx: number) {
        super(type, start, end, text)
        this.ndx = ndx
    }
}

export class Formatter {
    original: Token[]
    tokens: FormatterToken[]
    token?: FormatterToken
    curLine?: number
    curLineEmpty?: boolean
    sexprs: Expr[]
    edits: vscode.TextEdit[]

    indentWidth?: number
    fixWhitespace?: boolean
    closeParenOwnLine?: string
    closeParenStacked?: string
    indentCloseParenStack?: boolean

    constructor(doc: any, opts: any, tokens: Token[]) {
        this.original = tokens
        this.tokens = this.copyTokens(tokens)
        this.token = undefined
        this.curLine = undefined
        this.curLineEmpty = undefined
        this.sexprs = []
        this.edits = []
    }

    setConfiguration() {
        const cfg = workspace.getConfiguration('alive')
        const haveCfg = cfg !== undefined && cfg.format !== undefined

        if (!haveCfg) {
            return
        }

        this.indentWidth = cfg.format.indentWidth ?? DEFAULT_INDENT

        this.indentCloseParenStack = cfg.format.indentCloseParenStack ?? true
        this.closeParenStacked = cfg.format.closeParenStacked ?? undefined
        this.closeParenOwnLine = cfg.format.closeParenOwnLine ?? undefined

        this.fixWhitespace = cfg.format.fixWhitespace ?? undefined
    }

    copyTokens(tokens: Token[]): FormatterToken[] {
        const newTokens = []

        for (let ndx = 0; ndx < tokens.length; ndx += 1) {
            const token = tokens[ndx]
            const copy = JSON.parse(JSON.stringify(token))

            copy.ndx = ndx
            newTokens.push(copy)
        }

        return newTokens
    }

    format() {
        this.setConfiguration()

        this.edits = []
        this.curLine = 0
        this.curLineEmpty = true
        this.token = this.tokens[0]

        while (this.token !== undefined) {
            this.processToken()
        }

        // this.debugDump();
        return this.edits
    }

    debugDump() {
        let str = ''
        let line = 0

        for (let ndx = 0; ndx < this.tokens.length; ndx += 1) {
            const token = this.tokens[ndx]

            if (token.start.line !== line) {
                console.log(str)
                str = `[${token.start.line},${token.start.character}:${token.end.line},${token.end.character}]`
                line = token.start.line
            } else {
                str += `[${token.start.line},${token.start.character}:${token.end.line},${token.end.character}]`
            }
        }
    }

    processToken() {
        if (this.token === undefined) {
            return
        }

        if (this.token.start.line !== this.curLine) {
            this.curLine = this.token.start.line
            this.curLineEmpty = true
        }

        if (this.token.type === types.CLOSE_PARENS) {
            return this.closeParens()
        } else if (this.token.type === types.WHITE_SPACE) {
            return this.whitespace()
        }

        this.curLineEmpty = false
        this.checkMultiline()

        switch (this.token.type) {
            case types.OPEN_PARENS:
                return this.openParens()
            case types.ID:
            case types.CONTROL:
            case types.KEYWORD:
            case types.MACRO:
            case types.SPECIAL:
            case types.SYMBOL:
                return this.id()
            case types.PACKAGE_NAME:
            case types.POUND_SEQ:
            case types.STRING:
                return this.doIndent()
            default:
                this.consume()
        }
    }

    checkMultiline() {
        if (this.sexprs.length === 0 || this.token === undefined) {
            return
        }

        const sexpr = this.sexprs[this.sexprs.length - 1]

        if (sexpr.open.start.line !== this.token.start.line) {
            for (let ndx = 0; ndx < this.sexprs.length; ndx += 1) {
                this.sexprs[ndx].multiline = true
            }
        }
    }

    doIndent() {
        if (this.sexprs.length === 0) {
            this.consume()
            return
        }

        const sexpr = this.sexprs[this.sexprs.length - 1]

        this.setIndent(sexpr)
        this.consume()
    }

    id() {
        if (this.sexprs.length === 0 || this.token === undefined) {
            return
        }

        const sexpr = this.sexprs[this.sexprs.length - 1]
        const alignedIDs = ['IF', 'CONS', 'COND', 'AND', 'OR', 'EQ', 'EQL', 'EQUAL', 'EQUALP', 'LIST', ':USE', ':EXPORT']

        if (this.token.text === 'DEFUN') {
            this.startDefun(sexpr)
        } else if (this.token.text === 'LET' || this.token.text === 'LET*' || this.token.text === 'FLET') {
            this.startLet(sexpr)
        } else if (alignedIDs.includes(this.token.text)) {
            sexpr.isAligned = true
        }

        this.setIndent(sexpr)
        this.consume()
    }

    startDefun(sexpr: Expr) {
        sexpr.defun = {
            paramList: false,
        }
    }

    startLet(sexpr: Expr) {
        sexpr.isLet = true
        sexpr.hasVarExpr = false
    }

    setIndent(sexpr: Expr) {
        if (this.token === undefined) {
            return
        }

        if (sexpr.indent === undefined) {
            sexpr.alignNext = true
            sexpr.indent = this.alignIndent(sexpr, this.token)
        } else if (sexpr.alignNext) {
            sexpr.indent = this.alignIndent(sexpr, this.token)
            sexpr.alignNext = false
        }
    }

    alignIndent(sexpr: Expr, token: Token) {
        const width = this.indentWidth ?? 0

        return sexpr.isParamList || sexpr.isAligned ? token.start.character : sexpr.open.start.character + width
    }

    whitespace() {
        if (this.token === undefined) {
            return
        }

        if (this.token.ndx !== undefined && this.token.ndx >= this.tokens.length - 1) {
            return this.fixEOF()
        }

        if (this.sexprs.length === 0) {
            if (this.fixWhitespace) {
                this.trimWS(this.token)
                this.fixIndent(this.token, 0)
            }
        } else if (this.tokens[this.token.ndx + 1].type === types.CLOSE_PARENS) {
            // Close parens code handles this
        } else {
            const sexpr = this.sexprs[this.sexprs.length - 1]

            if (sexpr.indent === undefined && this.fixWhitespace) {
                this.deleteToken(this.token)
            } else if (this.token.start.line === this.token.end.line) {
                this.fixPadding()
            } else {
                this.fixIndent(this.token, sexpr.indent)
            }
        }

        this.consume()
    }

    trimWS(token: FormatterToken) {
        const orig = this.original[token.ndx]
        let start = 0
        let line = orig.start.line
        let startChar = orig.start.character

        while (start < token.text.length && token.text.charAt(start) === '\n') {
            start += 1
            line += 1
            startChar = 0
        }

        let end = start + 1
        let endChar = orig.start.character + 1
        while (end < token.text.length) {
            if (token.text.charAt(end) === '\n') {
                const a = new Position(line, startChar)
                const b = new Position(line, endChar)

                this.edits.push(TextEdit.delete(new Range(a, b)))

                line += 1
                startChar = 0
                endChar = 0
            }

            end += 1
            endChar += 1
        }
    }

    fixPadding() {
        if (!this.fixWhitespace || this.token === undefined || this.token.text.length <= 1) {
            return
        }

        const origToken = this.original[this.token.ndx]
        const start = new Position(origToken.start.line, origToken.start.character + 1)
        const end = new Position(origToken.end.line, origToken.end.character)
        const range = new Range(start, end)

        this.edits.push(TextEdit.delete(range))
        this.fixLine()
    }

    deleteToken(token: FormatterToken) {
        if (token === undefined) {
            return
        }

        const origToken = this.original[token.ndx]

        this.edits.push(TextEdit.delete(new Range(toVscodePos(origToken.start), toVscodePos(origToken.end))))

        this.fixLine()
    }

    fixIndent(token: FormatterToken, indent?: number) {
        if (indent === undefined) {
            return
        }

        const current = this.countIndent(token)
        const orig = this.original[token.ndx]

        if (this.fixWhitespace && token.type === types.WHITE_SPACE) {
            this.trimWS(token)
        }

        if (current < indent) {
            const diff = indent - current
            const pad = ' '.repeat(diff)

            this.edits.push(TextEdit.insert(new Position(orig.end.line, orig.end.character), pad))

            token.end = new Position(token.end.line, token.end.character + diff)
            this.fixLine()
        } else if (current > indent) {
            const diff = current - indent
            const start = new Position(orig.end.line, orig.end.character - diff)
            const end = new Position(orig.end.line, orig.end.character)

            this.edits.push(TextEdit.delete(new Range(start, end)))

            token.end = new Position(token.end.line, token.end.character - diff)
            this.fixLine()
        }
    }

    countIndent(token: FormatterToken) {
        const txt = token.text !== undefined ? token.text : ''
        let count = 0

        for (let ndx = txt.length - 1; ndx >= 0; ndx -= 1) {
            if (txt.charAt(ndx) !== ' ') {
                break
            }

            count += 1
        }

        return count
    }

    fixLine() {
        if (this.token === undefined) {
            return
        }

        let token = this.token
        let next = this.nextToken(token)

        while (token !== undefined && next !== undefined) {
            if (next.start.character !== token.end.character) {
                next.start = new Position(next.start.line, token.end.character)
            }

            if (next.start.line !== next.end.line) {
                break
            }

            next.end = new Position(next.start.line, next.start.character + next.text.length)

            token = next
            next = this.nextToken(token)
        }
    }

    fixEOF() {
        this.consume()
    }

    closeParens() {
        const sexpr = this.sexprs.pop()
        const count = this.countCloseParens()

        if (sexpr === undefined) {
            return
        }

        if (this.closeParenOwnLine === 'multiline') {
            this.closeOwnLineMulti(sexpr, count)
            this.consume()
        } else if (this.closeParenOwnLine === 'always') {
            this.closeOwnLineAlways(sexpr, count)
            this.consume()
        } else if (this.closeParenOwnLine === 'never') {
            this.closeOwnLineNever(sexpr, count)
            this.consume()
        } else {
            this.consume()
        }
    }

    closeOwnLineAlways(sexpr: Expr, count: number) {
        const indent = this.getCloseStackIndent(sexpr, count)

        this.forceOwnLine(indent)
        this.stackRemaining(count - 1)
    }

    closeOwnLineNever(sexpr: Expr, count: number) {
        if (this.token === undefined) {
            return
        }

        const prev = this.prevToken(this.token)

        if (prev !== undefined && prev.type === types.WHITE_SPACE) {
            this.deleteToken(prev)
        }

        this.stackRemaining(count - 1)
    }

    closeOwnLineMulti(sexpr: Expr, count: number) {
        let curExpr: Expr | undefined = sexpr

        while (this.token !== undefined && curExpr !== undefined && !curExpr.multiline) {
            const prev = this.prevToken(this.token)

            if (prev !== undefined && prev.type === types.WHITE_SPACE) {
                this.deleteToken(prev)
            }

            count -= 1
            if (count === 0) {
                return
            }

            this.token = this.findNextCloseParen()
            curExpr = this.sexprs.pop()
        }

        const indent = this.getCloseStackIndent(curExpr ?? sexpr, count)

        this.forceOwnLine(indent)
        this.stackRemaining(count - 1)
    }

    stackRemaining(count: number) {
        if (this.closeParenStacked === 'always') {
            this.stackCloseParens(count)
        } else if (this.closeParenStacked === 'never') {
            this.unstackCloseParens(count)
        }
    }

    unstackCloseParens(count: number) {
        while (this.token !== undefined && count > 0) {
            this.token = this.nextToken(this.token)

            if (this.token?.type === types.CLOSE_PARENS) {
                const sexpr = this.sexprs.pop()

                if (sexpr !== undefined) {
                    this.forceOwnLine(sexpr.open.start.character)
                }

                count -= 1
            }
        }
    }

    stackCloseParens(count: number) {
        while (this.token !== undefined && count > 0) {
            this.token = this.nextToken(this.token)

            if (this.token?.type === types.WHITE_SPACE) {
                this.deleteToken(this.token)
            } else if (this.token?.type === types.CLOSE_PARENS) {
                this.sexprs.pop()
                count -= 1
            } else {
                break
            }
        }
    }

    findNextCloseParen(): FormatterToken | undefined {
        if (this.token === undefined) {
            return undefined
        }

        for (let ndx = this.token.ndx + 1; ndx < this.tokens.length; ndx += 1) {
            if (this.tokens[ndx].type === types.CLOSE_PARENS) {
                return this.tokens[ndx]
            }
        }

        return undefined
    }

    forceOwnLine(indent: number) {
        if (this.token === undefined) {
            return
        }

        const prev = this.prevToken(this.token)

        if (prev?.type === types.WHITE_SPACE) {
            prev.start.line === prev.end.line ? this.breakLine(prev, indent) : this.fixIndent(prev, indent)
        } else {
            const pad = ' '.repeat(indent)
            this.edits.push(TextEdit.insert(toVscodePos(this.original[this.token.ndx].start), '\n' + pad))
        }
    }

    getCloseStackIndent(sexpr: Expr, count: number): number {
        if (this.sexprs.length === 0) {
            return 0
        }

        if (count === 1) {
            return sexpr.open.start.character
        }

        const ndx = this.sexprs.length - count + 1
        const target = this.indentCloseParenStack || this.closeParenStacked === 'never' ? sexpr : this.sexprs[ndx]

        return target.open.start.character
    }

    breakLine(token: FormatterToken, indent: number) {
        this.edits.push(TextEdit.insert(toVscodePos(this.original[token.ndx].start), '\n'))

        this.fixIndent(token, indent)
    }

    countCloseParens(): number {
        if (this.token === undefined) {
            return 0
        }

        let count = 0

        for (let ndx = this.token.ndx; ndx < this.tokens.length; ndx += 1) {
            const token = this.tokens[ndx]

            if (token.type === types.WHITE_SPACE) {
                continue
            }

            if (token.type !== types.CLOSE_PARENS) {
                break
            }

            count += 1
        }

        return count
    }

    openParens() {
        if (this.token === undefined) {
            return
        }

        let paramList = false

        if (this.sexprs.length > 0) {
            const sexpr = this.sexprs[this.sexprs.length - 1]

            if (sexpr.defun !== undefined && !sexpr.defun.paramList) {
                paramList = true
                sexpr.defun.paramList = true
            } else if (sexpr.isLet && !sexpr.hasVarExpr) {
                paramList = true
                sexpr.hasVarExpr = true
            } else if (sexpr.indent === undefined || sexpr.alignNext) {
                sexpr.indent = this.token.start.character
                sexpr.alignNext = false
            }
        }

        const expr = {
            open: this.token,
            alignNext: false,
            indent: undefined,
            multiline: false,
            isParamList: false,
            isAligned: false,
        }

        if (paramList) {
            expr.isParamList = true
        }

        this.sexprs.push(expr)
        this.consume()
    }

    prevToken(token: FormatterToken): FormatterToken | undefined {
        const ndx = token.ndx - 1

        if (ndx < 0) {
            return undefined
        }

        return this.tokens[ndx]
    }

    nextToken(token: FormatterToken): FormatterToken | undefined {
        const ndx = token.ndx + 1

        if (ndx >= this.tokens.length) {
            return undefined
        }

        return this.tokens[ndx]
    }

    consume() {
        if (this.token === undefined) {
            return
        }

        const next = this.token.ndx + 1 < this.tokens.length ? this.tokens[this.token.ndx + 1] : undefined

        this.token = next
    }

    debugToken(token: FormatterToken) {
        return `[${token.start.line},${token.start.character}]`
    }
}
