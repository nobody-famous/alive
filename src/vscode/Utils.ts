import * as vscode from 'vscode'
import { types } from '../lisp'

export function toVscodePos(pos: types.Position): vscode.Position {
    return new vscode.Position(pos.line, pos.character)
}
