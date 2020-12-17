import { Expr } from './Expr'

export const INVALID = -1
export const WHITE_SPACE = 0
export const ID = 1
export const OPEN_PARENS = 2
export const CLOSE_PARENS = 3
export const STRING = 4
export const PACKAGE_NAME = 5
export const SYMBOL = 6
export const FUNCTION = 7
export const PARAMETER = 8
export const SINGLE_QUOTE = 9
export const BACK_QUOTE = 10
export const QUOTED = 11
export const QUOTE_FUNC = 12
export const COMMENT = 13
export const POUND_SEQ = 14
export const CONTROL = 15
export const MACRO = 16
export const KEYWORD = 17
export const SPECIAL = 18
export const PACKAGES = 19
export const IN_PACKAGE = 20
export const DEFPACKAGE = 21
export const COMMA = 22
export const VARIABLE = 23
export const DEFUN = 24
export const DEFINE_CONDITION = 25
export const DEFCLASS = 26
export const LOOP = 27
export const DEFMACRO = 28
export const DEFMETHOD = 29
export const ERROR = 30

export const MISMATCHED_OPEN_PARENS = 100
export const MISMATCHED_CLOSE_PARENS = 101
export const MISMATCHED_DBL_QUOTE = 102
export const MISMATCHED_COMMENT = 103
export const MISMATCHED_BAR = 104

export interface NameValuePair {
    name: string
    value: Expr
}

export interface ExprMap {
    [index: string]: Expr
}

export class Position {
    line: number
    character: number

    constructor(line: number, character: number) {
        this.line = line
        this.character = character
    }

    toString(): string {
        return `(${this.line}:${this.character})`
    }
}
