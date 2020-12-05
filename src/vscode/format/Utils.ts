import { types } from '../../lisp'
import { FormatToken } from './FormatToken'
import { TokenList } from './TokenList'

export interface Options {
    indentWidth: number
    closeParenOwnLine: string
    closeParenStacked: string
    indentCloseParenStack: boolean
}

export class State {
    indent: number[]
    tokenList: TokenList
    lineLength: number = 0

    options: Options

    constructor(opts: Options, indent: number[], tokenList: TokenList) {
        this.indent = indent
        this.tokenList = tokenList
        this.options = opts
    }
}

export function isExprEnd(curToken: FormatToken | undefined): boolean {
    return curToken === undefined || curToken.token.type === types.CLOSE_PARENS
}

export function setTarget(state: State, token: FormatToken, target: string) {
    token.before.target = target
    state.lineLength += target.length
}

export function withIndent(state: State, length: number, fn: () => void) {
    pushNewIndent(state, length)

    try {
        fn()
    } finally {
        state.indent.pop()
    }
}

export function withIncIndent(state: State, inc: number, fn: () => void) {
    const indent = state.indent
    const curIndent = indent[indent.length - 1]
    const newIndent = curIndent + inc

    withIndent(state, newIndent, fn)
}

export function pushNewIndent(state: State, indent: number) {
    state.indent.push(indent)
}

export function countNewLines(text: string): number {
    let count = 0

    for (const ch of text) {
        if (ch === '\n') {
            count += 1
        }
    }

    return count
}
