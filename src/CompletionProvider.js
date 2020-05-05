// const { keywords } = require('./keywords');
const { CompletionItem, MarkdownString } = require('vscode');
const { posInExpr, Defun, Let } = require('./lisp/Expr');

// const completions = keywords.map(word => {
//     const item = new CompletionItem(word.label);

//     if (word.doc !== undefined) {
//         item.documentation = new MarkdownString(word.doc);
//     }

//     return item;
// });

module.exports.CompletionProvider = class {
    constructor(pkgMgr) {
        this.packageMgr = pkgMgr;
    }

    getCompletions(exprs, pos) {
        const expr = this.findExpr(exprs, pos);
        if (expr === undefined) {
            return [];
        }

        const symbols = this.packageMgr.getSymbols(expr.start.line);
        const locals = this.getLocals(expr, pos);
        const completions = locals.concat(symbols);

        return completions.map(item => new CompletionItem(item.toLowerCase()));
    }

    getLocals(expr, pos) {
        if (!posInExpr(expr, pos)) {
            return [];
        }

        let locals = [];

        if (expr instanceof Defun) {
            locals = locals.concat(expr.args);
            expr.body.forEach(expr => locals = locals.concat(this.getLocals(expr, pos)));
        } else if (expr instanceof Let) {
            locals = locals.concat(Object.keys(expr.vars));
            expr.body.forEach(expr => locals = locals.concat(this.getLocals(expr, pos)));
        }

        return locals;
    }
};
