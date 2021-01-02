import * as vscode from 'vscode'
import { Expr, getLocalDef, SExpr } from '../../lisp'
import { exprToString, findAllAtoms, findAtom } from '../../lisp/Utils'
import { ExtensionState } from '../Types'
import { getDocumentExprs, getTopExpr, samePosition, toVscodePos } from '../Utils'

export function getRenameProvider(state: ExtensionState): vscode.RenameProvider {
    return new Provider(state)
}

class Provider implements vscode.RenameProvider {
    state: ExtensionState

    constructor(state: ExtensionState) {
        this.state = state
    }

    async provideRenameEdits(doc: vscode.TextDocument, pos: vscode.Position, newName: string): Promise<vscode.WorkspaceEdit> {
        const exprs = getDocumentExprs(doc)
        const topExpr = await getTopExpr(doc, pos)

        if (topExpr === undefined) {
            return new vscode.WorkspaceEdit()
        }

        const atom = findAtom(exprs, pos)
        const label = atom !== undefined ? exprToString(atom) : undefined

        if (label === undefined || label.startsWith('#')) {
            return new vscode.WorkspaceEdit()
        }

        const def = getLocalDef(topExpr, pos, label)
        if (def !== undefined) {
            return this.renameLocal(doc, def, topExpr, newName)
        }

        return new vscode.WorkspaceEdit()
    }

    private renameLocal(doc: vscode.TextDocument, def: Expr, topExpr: Expr, text: string): vscode.WorkspaceEdit {
        if (!(topExpr instanceof SExpr)) {
            return new vscode.WorkspaceEdit()
        }

        const atoms = findAllAtoms(topExpr)
        const edit = new vscode.WorkspaceEdit()

        for (const atom of atoms) {
            const atomLabel = exprToString(atom)
            const atomDef = atomLabel !== undefined ? getLocalDef(topExpr, atom.start, atomLabel) : undefined

            if (atomLabel === undefined || atomDef === undefined) {
                continue
            }

            if (samePosition(atomDef.start, def.start)) {
                const range = new vscode.Range(toVscodePos(atom.start), toVscodePos(atom.end))

                edit.replace(doc.uri, range, text)
            }
        }

        return edit
    }
}
