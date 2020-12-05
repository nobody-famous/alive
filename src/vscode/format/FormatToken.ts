import * as vscode from 'vscode'
import { Token } from '../../lisp'

export class Whitespace {
    start: vscode.Position
    existing: string = ''
    target: string = ''

    constructor(start: vscode.Position) {
        this.start = start
    }
}

export class FormatToken {
    before: Whitespace
    token: Token
    onOwnLine: boolean = false

    constructor(before: Whitespace, token: Token) {
        this.before = before
        this.token = token
    }
}
