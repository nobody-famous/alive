import * as vscode from 'vscode'
import { Expr, exprToString, findAtom } from '../lisp'
import { FindDefs } from '../swank/response'
import { Repl } from './repl'

export class DefinitionProvider {
    async getDefinitions(
        repl: Repl,
        pkgName: string,
        exprs: Expr[],
        pos: vscode.Position
    ): Promise<vscode.Location[] | undefined> {
        if (repl === undefined) {
            return undefined
        }

        const atom = findAtom(exprs, pos)

        if (atom === undefined) {
            return undefined
        }

        const label = exprToString(atom)

        if (label === undefined) {
            return undefined
        }

        const defsRes = await repl.findDefs(label, pkgName)

        if (!(defsRes instanceof FindDefs)) {
            return undefined
        }

        const locs: vscode.Location[] = []

        for (const loc of defsRes.locs) {
            const pos = await this.getDocPosition(loc.file, loc.position)

            if (pos !== undefined) {
                locs.push(new vscode.Location(vscode.Uri.file(loc.file), pos))
            }
        }

        return locs
    }

    private async getDocPosition(fileName: string, offset: number): Promise<vscode.Position | undefined> {
        try {
            const uri = vscode.Uri.file(fileName)
            const doc = await vscode.workspace.openTextDocument(uri.fsPath)

            return doc.positionAt(offset)
        } catch (err) {
            return undefined
        }
    }
}
