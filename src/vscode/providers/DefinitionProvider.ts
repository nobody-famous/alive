import { format } from 'util'
import * as vscode from 'vscode'
import { Expr, exprToString, findAtom, getLocalDef } from '../../lisp'
import { FindDefs } from '../../swank/response'
import { ExtensionState } from '../Types'
import { getDocumentExprs, getTopExpr, toVscodePos, updatePkgMgr } from '../Utils'

export function getDefinitionProvider(state: ExtensionState): vscode.DefinitionProvider {
    return new Provider(state)
}

class Provider implements vscode.DefinitionProvider {
    state: ExtensionState

    constructor(state: ExtensionState) {
        this.state = state
    }

    async provideDefinition(doc: vscode.TextDocument, pos: vscode.Position) {
        try {
            const exprs = getDocumentExprs(doc)
            const topExpr = await getTopExpr(doc, pos)

            await updatePkgMgr(this.state, doc, exprs)

            const pkg = this.state.pkgMgr.getPackageForLine(doc.fileName, pos.line)
            const atom = findAtom(exprs, pos)
            const label = atom !== undefined ? exprToString(atom) : undefined
            let local: vscode.Location | undefined = undefined

            if (!label?.startsWith('#') && topExpr !== undefined) {
                const locDef = label !== undefined ? getLocalDef(topExpr, pos, label) : undefined

                if (locDef !== undefined) {
                    const start = toVscodePos(locDef.start)
                    const range = new vscode.Range(start, start)

                    if (start.line !== atom?.start.line || start.character !== atom.start.character) {
                        local = new vscode.Location(doc.uri, range)
                    }
                }
            }

            if (this.state.repl === undefined || pkg === undefined) {
                return []
            }

            const defs = await this.getDefinitions(pkg.name, exprs, pos)

            if (local !== undefined) {
                defs?.push(local)
            }

            return defs ?? []
        } catch (err) {
            vscode.window.showErrorMessage(format(err))
            return []
        }
    }

    async getDefinitions(pkgName: string, exprs: Expr[], pos: vscode.Position): Promise<vscode.Location[] | undefined> {
        if (this.state.repl === undefined) {
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

        const defsRes = await this.state.repl.findDefs(label, pkgName)

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
