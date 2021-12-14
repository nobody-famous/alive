import { format } from 'util'
import * as vscode from 'vscode'
import { Expr, exprToString, findAtom, getLocalDef } from '../../lisp'
import { FindDefs } from '../../swank/response'
import { SwankBackendState } from '../Types'
import { getDocumentExprs, getFilePosition, getTopExpr, toVscodePos } from '../Utils'

export class DefinitionProvider implements vscode.DefinitionProvider {
    state: SwankBackendState

    constructor(state: SwankBackendState) {
        this.state = state
    }

    async provideDefinition(doc: vscode.TextDocument, pos: vscode.Position) {
        try {
            const exprs = getDocumentExprs(doc)
            const topExpr = await getTopExpr(doc, pos)

            await this.state.pkgMgr.update(this.state.repl, doc, exprs)

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

    private async getDefinitions(pkgName: string, exprs: Expr[], pos: vscode.Position): Promise<vscode.Location[] | undefined> {
        if (this.state.repl === undefined) {
            return undefined
        }

        const atom = findAtom(exprs, pos)
        const label = atom !== undefined ? exprToString(atom) : undefined

        if (atom === undefined || label === undefined) {
            return undefined
        }

        const defsRes = await this.state.repl.findDefs(label, pkgName)

        if (!(defsRes instanceof FindDefs)) {
            return undefined
        }

        const locs: vscode.Location[] = []

        for (const loc of defsRes.locs) {
            const pos = await getFilePosition(loc.file, loc.position)

            if (pos !== undefined) {
                locs.push(new vscode.Location(vscode.Uri.file(loc.file), pos))
            }
        }

        return locs
    }
}
