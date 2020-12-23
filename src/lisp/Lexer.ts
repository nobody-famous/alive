import * as types from './Types'
import * as kw from './keywords'
import { Token } from './Token'

import arrays from './keywords/arrays'
import control from './keywords/control'
import kwTypes from './keywords/types'
import iteration from './keywords/iteration'
import objects from './keywords/objects'
import structures from './keywords/structures'
import conditions from './keywords/conditions'
import symbols from './keywords/symbols'
import packages from './keywords/packages'
import numbers from './keywords/numbers'
import characters from './keywords/characters'
import conses from './keywords/conses'
import strings from './keywords/strings'
import sequences from './keywords/sequences'
import hashtables from './keywords/hashtables'
import filenames from './keywords/filenames'
import files from './keywords/files'
import streams from './keywords/streams'
import printer from './keywords/printer'
import reader from './keywords/reader'
import sysconstruct from './keywords/sysconstruct'
import env from './keywords/env'
import kwEval from './keywords/eval'

type kw = { [index: string]: number }
const keywords: kw = {}

arrays.forEach((item) => addKeyword(item, types.KEYWORD))
control.forEach((item) => addKeyword(item, types.CONTROL))
kwTypes.forEach((item) => addKeyword(item, types.KEYWORD))
iteration.forEach((item) => addKeyword(item, types.KEYWORD))
objects.forEach((item) => addKeyword(item, types.KEYWORD))
structures.forEach((item) => addKeyword(item, types.KEYWORD))
conditions.forEach((item) => addKeyword(item, types.KEYWORD))
symbols.forEach((item) => addKeyword(item, types.KEYWORD))
packages.forEach((item) => addKeyword(item, types.PACKAGES))
numbers.forEach((item) => addKeyword(item, types.KEYWORD))
characters.forEach((item) => addKeyword(item, types.KEYWORD))
conses.forEach((item) => addKeyword(item, types.KEYWORD))
strings.forEach((item) => addKeyword(item, types.KEYWORD))
sequences.forEach((item) => addKeyword(item, types.KEYWORD))
hashtables.forEach((item) => addKeyword(item, types.KEYWORD))
filenames.forEach((item) => addKeyword(item, types.KEYWORD))
files.forEach((item) => addKeyword(item, types.KEYWORD))
streams.forEach((item) => addKeyword(item, types.KEYWORD))
printer.forEach((item) => addKeyword(item, types.KEYWORD))
reader.forEach((item) => addKeyword(item, types.KEYWORD))
sysconstruct.forEach((item) => addKeyword(item, types.KEYWORD))
env.forEach((item) => addKeyword(item, types.KEYWORD))
kwEval.forEach((item) => addKeyword(item, types.KEYWORD))

function addKeyword(item: kw.kwEntry, wordType: number) {
    const label = item.label.toUpperCase()

    if (item.type === 'Function' || item.type === 'Local Function' || item.type === 'Accessor') {
        keywords[label] = wordType
    } else if (item.type === 'Macro' || item.type === 'Local Macro') {
        keywords[label] = types.MACRO
    } else if (item.type === 'Special Operator') {
        keywords[label] = types.SPECIAL
    } else if (item.type === 'Variable') {
        keywords[label] = types.VARIABLE
    } else {
        keywords[label] = types.KEYWORD
    }
}

export class Lexer {
    text: string
    line: number
    col: number
    curPos: number
    opens: number
    curText: string
    start: types.Position

    constructor(text: string) {
        this.text = text
        this.line = 0
        this.col = 0
        this.curPos = 0
        this.curText = ''
        this.start = new types.Position(0, 0)
        this.opens = 0
    }

    getTokens(): Token[] {
        const tokens = []

        while (true) {
            const token = this.nextToken()
            if (token === undefined) {
                break
            }

            tokens.push(token)
        }

        return tokens
    }

    nextToken() {
        this.start = new types.Position(this.line, this.col)
        this.curText = ''

        let char = this.peek()
        if (char === undefined) {
            return undefined
        }

        if (this.isWS(char)) {
            return this.ws()
        }

        switch (char) {
            case '(':
                return this.char(types.OPEN_PARENS)
            case ')':
                return this.char(types.CLOSE_PARENS)
            case "'":
                return this.char(types.SINGLE_QUOTE)
            case '`':
                return this.char(types.BACK_QUOTE)
            case ',':
                return this.char(types.COMMA)
            case '"':
                return this.quotedString()
            case '#':
                return this.pound()
            case '|':
                return this.bar()
            case ';':
                return this.comment(char)
            default:
                return this.id()
        }
    }

    comment(char: string) {
        this.curText += char
        this.consume()

        while (this.peek() !== undefined && this.peek() !== '\n') {
            this.curText += this.peek() ?? ''
            this.consume()
        }

        return this.newToken(types.COMMENT)
    }

    bar() {
        this.consume()

        while (true) {
            if (this.peek() === undefined || this.peek() === '\n') {
                return this.newToken(types.MISMATCHED_BAR)
            }

            if (this.peek() === '\\') {
                this.curText += this.peek() ?? ''
                this.consume()

                if (this.peek() === undefined) {
                    return this.newToken(types.MISMATCHED_BAR)
                }

                this.curText += this.peek() ?? ''
                this.consume()
            } else if (this.peek() === '|') {
                this.consume()
                break
            } else {
                this.curText += this.peek() ?? ''
                this.consume()
            }
        }

        return this.newToken(types.ID, true)
    }

    pound() {
        this.consume()

        if (this.peek() === '|') {
            this.consume()
            return this.nestedComment()
        } else {
            this.curText += '#'
            return this.poundSequence()
        }
    }

    poundSequence() {
        if (this.peek() === '\\') {
            this.curText += this.peek() ?? ''
            this.consume()

            while (!this.isDelimiter(this.peek())) {
                this.curText += this.peek() ?? ''
                this.consume()
            }

            return this.newToken(types.POUND_SEQ)
        }

        while (!this.isWS(this.peek())) {
            const ch = this.peek()
            if (ch === undefined) {
                break
            }

            if (ch === '(') {
                this.curText += '('
                this.consumeExpr()
                break
            } else if (ch === ')') {
                break
            } else {
                this.curText += this.peek() ?? ''
                this.consume()
            }
        }

        return this.newToken(types.POUND_SEQ)
    }

    consumeExpr() {
        let opens = 1

        this.consume()

        while (opens > 0) {
            const ch = this.peek()

            if (ch === undefined) {
                break
            }

            if (ch === '(') {
                opens += 1
            } else if (ch === ')') {
                opens -= 1
            }

            this.curText += ch
            this.consume()
        }
    }

    nestedComment() {
        this.opens = 0

        while (true) {
            if (this.peek() === undefined) {
                return this.newToken(types.MISMATCHED_COMMENT)
            }

            if (this.peek() === '|') {
                this.consume()

                if (this.peek() === '#') {
                    this.consume()
                    this.opens -= 1

                    if (this.opens < 0) {
                        break
                    } else {
                        this.curText += '|#'
                    }
                } else {
                    this.curText += '|'
                }
            } else if (this.peek() === '\\') {
                this.curText += this.peek() ?? ''
                this.consume()

                if (this.peek() !== undefined) {
                    this.curText += this.peek() ?? ''
                    this.consume()
                }
            } else if (this.peek() === '#') {
                this.curText += this.peek() ?? ''
                this.consume()

                if (this.peek() === '|') {
                    this.opens += 1

                    this.curText += this.peek() ?? ''
                    this.consume()
                }
            } else {
                this.curText += this.peek() ?? ''
                this.consume()
            }
        }

        return this.newToken(types.COMMENT)
    }

    quotedString() {
        this.curText += this.peek() ?? ''
        this.consume()

        while (this.peek() !== '"') {
            if (this.peek() === undefined) {
                return this.newToken(types.MISMATCHED_DBL_QUOTE)
            }

            if (this.peek() === '\\') {
                this.curText += this.peek() ?? ''
                this.consume()
            }

            this.curText += this.peek() ?? ''
            this.consume()
        }

        this.curText += this.peek() ?? ''
        this.consume()

        return this.newToken(types.STRING)
    }

    id() {
        this.curText += this.peek() ?? ''
        this.consume()

        while (!this.isDelimiter(this.peek())) {
            this.curText += this.peek() ?? ''
            this.consume()
        }

        if (this.curText.indexOf(':') >= 0) {
            return this.newToken(types.SYMBOL, true)
        }

        this.curText = this.curText.toUpperCase()
        const keywordID = keywords[this.curText]
        if (keywordID !== undefined) {
            return this.keywordToken()
        }

        return this.newToken(types.ID, true)
    }

    keywordToken() {
        const keywordID = keywords[this.curText]

        switch (this.curText) {
            case 'DEFPACKAGE':
                return this.newToken(types.DEFPACKAGE, true)
            case 'IN-PACKAGE':
                return this.newToken(types.IN_PACKAGE, true)
            case 'DEFUN':
                return this.newToken(types.DEFUN, true)
            case 'DEFMACRO':
                return this.newToken(types.DEFMACRO, true)
            case 'DEFMETHOD':
                return this.newToken(types.DEFMETHOD, true)
            case 'DEFINE-CONDITION':
                return this.newToken(types.DEFINE_CONDITION, true)
            case 'DEFCLASS':
                return this.newToken(types.DEFCLASS, true)
            case 'LOOP':
                return this.newToken(types.LOOP, true)
            default:
                return this.newToken(keywordID, true)
        }
    }

    char(type: number) {
        this.curText = this.peek() ?? ''
        this.consume()

        return this.newToken(type)
    }

    ws() {
        this.curText += this.peek() ?? ''
        this.consume()

        while (this.isWS(this.peek())) {
            this.curText += this.peek() ?? ''
            this.consume()
        }

        return this.newToken(types.WHITE_SPACE)
    }

    isWS(char?: string) {
        return char !== undefined && char.trim() === ''
    }

    isParens(char?: string) {
        return char !== undefined && (char === '(' || char === ')')
    }

    isDelimiter(char?: string) {
        return char === undefined || this.isWS(char) || this.isParens(char) || char === '"'
    }

    newToken(type: number, upcase = false): Token {
        const text = upcase ? this.curText.toUpperCase() : this.curText
        return new Token(type, this.start, new types.Position(this.line, this.col), text)
    }

    peek() {
        if (this.curPos >= this.text.length) {
            return undefined
        }

        return this.text.charAt(this.curPos)
    }

    consume() {
        if (this.curPos >= this.text.length) {
            return
        }

        if (this.peek() === '\n') {
            this.line += 1
            this.col = 0
        } else {
            this.col += 1
        }

        this.curPos += 1
    }
}
