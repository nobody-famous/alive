import * as vscode from 'vscode'
import { exprToString, findAtom } from '../../lisp'
import { ExtensionState } from '../Types'
import { getDocumentExprs, getPkgName } from '../Utils'

export function getHoverProvider(state: ExtensionState): vscode.HoverProvider {
    return new Provider(state)
}

class Provider implements vscode.HoverProvider {
    state: ExtensionState

    constructor(state: ExtensionState) {
        this.state = state
    }

    async provideHover(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.Hover> {
        if (this.state.hoverText !== '') {
            return new vscode.Hover(this.state.hoverText)
        } else if (this.state.repl === undefined) {
            return new vscode.Hover('')
        }

        const exprs = getDocumentExprs(doc)
        const atom = findAtom(exprs, pos)
        if (atom?.isComment() || atom?.isError()) {
            return new vscode.Hover('')
        }

        const textStr = atom !== undefined ? exprToString(atom) : undefined
        let pkgName = getPkgName(doc, pos.line, this.state.pkgMgr, this.state.repl)
        let text = ''

        if (textStr === undefined) {
            return new vscode.Hover('')
        }

        text = await this.state.repl.getDoc(textStr, pkgName)

        if (text.startsWith('No such symbol')) {
            text = ''
        }

        return new vscode.Hover(text)
    }
}
