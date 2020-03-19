const { keywords } = require('./keywords');
const { CompletionItem, MarkdownString, Range } = require('vscode');
const { PackageMgr } = require('./lisp/PackageMgr');

const completions = keywords.map(word => {
    const item = new CompletionItem(word.label);

    if (word.doc !== undefined) {
        item.documentation = new MarkdownString(word.doc);
    }

    return item;
});

module.exports.CompletionProvider = class {
    constructor() {
    }

    getCompletions(ast, pos) {
        let node = this.getPositionNode(ast, pos);
        if (node === undefined) {
            return [];
        }

        const packageMgr = new PackageMgr();
        packageMgr.process(ast);

        let completions = undefined;
        if (node.open !== undefined) {
            completions = packageMgr.getSymbols(node.open.start.line);
        } else if (node.value !== undefined) {
            completions = packageMgr.getSymbols(node.value.start.line);
        }

        return completions.map(item => new CompletionItem(item.toLowerCase()));
    }

    getPositionNode(ast, pos) {
        for (let node of ast.nodes) {
            const range = this.getNodeRange(node);

            if (this.isPosInRange(pos, range)) {
                return node;
            }
        }

        return undefined;
    }

    getNodeRange(node) {
        if (node.open !== undefined) {
            return new Range(node.open.start, node.close.start);
        }

        if (node.value !== undefined) {
            return new Range(node.value.start, node.value.end);
        }

        return undefined;
    }

    isPosInRange(pos, range) {
        if (range === undefined) {
            return false;
        }

        if (pos.line === range.start.line && pos.character < range.start.character) {
            return false;
        }

        if (pos.line === range.end.line && pos.character > range.end.character) {
            return false;
        }

        return (pos.line >= range.start.line && pos.line <= range.end.line);
    }
};
