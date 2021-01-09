import * as vscode from 'vscode'
import { Atom, Expr, SExpr, types } from '../../lisp'
import { ExtensionState } from '../Types'
import { getDocumentExprs } from '../Utils'

export function getFoldProvider(state: ExtensionState): vscode.FoldingRangeProvider {
    return new Provider()
}

class Provider implements vscode.FoldingRangeProvider {
    async provideFoldingRanges(doc: vscode.TextDocument): Promise<vscode.FoldingRange[]> {
        const folds: vscode.FoldingRange[] = []
        const exprs = getDocumentExprs(doc)

        for (const expr of exprs) {
            this.addFolds(folds, expr)
        }

        return folds
    }

    private addFolds(folds: vscode.FoldingRange[], expr: Expr) {
        this.addExprFold(folds, expr)

        if (expr instanceof SExpr) {
            for (const part of expr.parts) {
                this.addFolds(folds, part)
            }
        }
    }

    private addExprFold(folds: vscode.FoldingRange[], expr: Expr) {
        if (expr.start.line === expr.end.line) {
            return
        }

        let kind: vscode.FoldingRangeKind | undefined = undefined

        if (expr instanceof Atom && expr.type === types.COMMENT) {
            kind = vscode.FoldingRangeKind.Comment
        }

        folds.push(new vscode.FoldingRange(expr.start.line, expr.end.line))
    }
}
