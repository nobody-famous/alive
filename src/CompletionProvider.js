const { keywords } = require('./keywords');
const { CompletionItem, MarkdownString } = require('vscode');
const { PackageMgr } = require('./lisp/PackageMgr');

const completions = keywords.map(word => {
    const item = new CompletionItem(word.label);

    if (word.doc !== undefined) {
        item.documentation = new MarkdownString(word.doc);
    }

    return item;
});

module.exports.CompletionProvider = class {
    constructor(pkgMgr) {
        this.packageMgr = pkgMgr;
    }

    getCompletions(ast, pos) {
        let node = ast.getPositionNode(pos);
        if (node === undefined) {
            return [];
        }

        const symbols = this.getSymbols(node);
        const locals = this.getLocals(node, pos);
        const completions = locals.concat(symbols);

        return completions.map(item => new CompletionItem(item.toLowerCase()));
    }

    getSymbols(node) {
        if (node.open !== undefined) {
            return this.packageMgr.getSymbols(node.open.start.line);
        } else if (node.value !== undefined) {
            return this.packageMgr.getSymbols(node.value.start.line);
        }

        return [];
    }

    getLocals(node, pos) {
        console.log(`getLocals ${pos.line}:${pos.character}`);
        const locals = [];

        return locals;
    }
};
