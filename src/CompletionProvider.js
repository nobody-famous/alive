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

        let completions = undefined;
        if (node.open !== undefined) {
            completions = this.packageMgr.getSymbols(node.open.start.line);
        } else if (node.value !== undefined) {
            completions = this.packageMgr.getSymbols(node.value.start.line);
        }

        return completions.map(item => new CompletionItem(item.toLowerCase()));
    }
};
