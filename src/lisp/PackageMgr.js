const types = require('../Types');

class Package {
    constructor() {
        this.exports = [];
        this.uses = [];
        this.symbols = {};
    }
}

module.exports.PackageMgr = class {
    constructor() {
        this.curPackage = 'cl-user';
        this.pkgs = {
            'cl-user': [],
        }
    }

    process(ast) {
        for (let ndx = 0; ndx < ast.nodes.length; ndx += 1) {
            const node = ast.nodes[ndx];
            if (node.open !== undefined) {
                this.processExpr(node);
            }
        }
    }

    processExpr(node) {
        const kids = node.kids;
        let ndx = (kids[0].value !== undefined && kids[0].value.type === types.WHITE_SPACE) ? 1 : 0;

        if (kids[ndx].value === undefined) {
            console.log(`PackageMgr.processExpr NO VALUE ${kids[ndx.value.text]} ${kids[ndx.value.type]}`);
            return;
        }

        const token = kids[ndx].value;
        if (token.type === types.IN_PACKAGE) {
            this.processInPackage(kids[ndx + 2].value);
        } else if (token.type === types.DEFPACKAGE) {
            this.processDefPackage(kids.slice(ndx + 2));
        } else if (token.type === types.DEFUN) {
            this.processDefun(kids.slice(ndx + 2));
        } else if (token.type === types.LOAD) {
            // Ignore
        } else {
            console.log(`PackageMgr unhandled expr ${kids[ndx].value.text} ${kids[ndx].value.type}`);
        }
    }

    processDefun(nodes) {
        let ndx = (nodes[0].value !== undefined && nodes[0].value.type === types.WHITE_SPACE) ? 1 : 0;
        let token = nodes[ndx].value;

        if (token === undefined || token.type !== types.ID) {
            return;
        }

        this.curPackage.symbols[token.text] = nodes;
    }

    processDefPackage(nodes) {
        let name = undefined;

        if (nodes[0].value.type === types.SYMBOL) {
            name = nodes[0].value.text.substring(1);
        }

        if (name === undefined) {
            return;
        }

        this.createPackage(name, nodes.slice(2));
    }

    createPackage(name, nodes) {
        const pkg = new Package();

        for (let ndx = 0; ndx < nodes.length; ndx += 2) {
            const node = nodes[ndx];

            if (node.type === types.WHITE_SPACE) {
                continue;
            }

            this.packageElement(pkg, node);
        }

        this.pkgs[name] = pkg;
    }

    packageElement(pkg, node) {
        if (node.kids.length === 0) {
            return;
        }

        const ndx = (node.kids[0].value.type === types.WHITE_SPACE) ? 1 : 0;
        const token = node.kids[ndx].value;

        if (token.type !== types.SYMBOL) {
            return;
        }

        if (token.text === ':export') {
            this.packageExports(pkg, node.kids.slice(ndx + 1));
        } else if (token.text === ':use') {
            this.packageUses(pkg, node.kids.slice(ndx + 1));
        }
    }

    packageExports(pkg, nodes) {
        for (let ndx = 0; ndx < nodes.length; ndx += 1) {
            const token = nodes[ndx].value;
            if (token === undefined || token.type === types.WHITE_SPACE) {
                continue;
            }

            const name = (token.type === types.SYMBOL)
                ? token.text.substring(1)
                : token.text;

            pkg.exports.push(name);
        }
    }

    packageUses(pkg, nodes) {
        for (let ndx = 0; ndx < nodes.length; ndx += 1) {
            const token = nodes[ndx].value;
            if (token === undefined || token.type === types.WHITE_SPACE) {
                continue;
            }

            const name = (token.type === types.SYMBOL)
                ? token.text.substring(1)
                : token.text;

            pkg.uses.push(name);
        }
    }

    processInPackage(token) {
        const name = (token.type == types.SYMBOL) ? token.text.substring(1) : token.text;

        if (name === 'cl-user' || name === 'common-lisp-user') {
            this.curPackage = 'cl-user';
            return;
        }

        if (this.pkgs[name] === undefined) {
            return;
        }

        this.curPackage = this.pkgs[name];
    }
};
