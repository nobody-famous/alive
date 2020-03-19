const types = require('../Types');
const { allLabels } = require('../keywords');

const CL_USER_PKG = 'CL-USER';

class Package {
    constructor(name) {
        this.name = name.toUpperCase();
        this.exports = [];
        this.uses = [];
        this.symbols = {};
        this.startLine = undefined;
        this.endLine = undefined;
    }
}

module.exports.PackageMgr = class {
    constructor() {
        this.curPackage = undefined;
        this.pkgs = {};
        this.pkgs[CL_USER_PKG] = new Package(CL_USER_PKG);
    }

    process(ast) {
        this.initMainPackage();

        for (let ndx = 0; ndx < ast.nodes.length; ndx += 1) {
            const node = ast.nodes[ndx];
            if (node.open !== undefined) {
                this.processExpr(node);
                this.curPackage.endLine = node.close.start.line;
            } else {
                this.curPackage.endLine = node.value.start.line;
            }
        }
    }

    initMainPackage() {
        this.curPackage = this.pkgs[CL_USER_PKG];

        for (let label of allLabels) {
            this.pkgs[CL_USER_PKG].exports.push(label.toUpperCase());
            this.pkgs[CL_USER_PKG].symbols[label.toUpperCase()] = {};
        }
    }

    getSymbols(line) {
        let symbols = [];
        const uses = this.curPackage.uses;

        for (let pkg of Object.values(this.pkgs)) {
            if (pkg.startLine <= line && pkg.endLine >= line) {
                symbols = symbols.concat(Object.keys(pkg.symbols));
            } else {
                const usesPkg = uses.includes(pkg.name);
                const names = pkg.exports.map(label => usesPkg ? label : `${pkg.name}:${label}`);
                symbols = symbols.concat(names);
            }
        }

        return symbols;
    }

    processExpr(node) {
        const kids = node.kids;
        let ndx = (kids[0].value !== undefined && kids[0].value.type === types.WHITE_SPACE) ? 1 : 0;

        if (kids[ndx].value === undefined) {
            console.log(`PackageMgr.processExpr NO VALUE ${kids[ndx.value.text]} ${kids[ndx.value.type]} `);
            return;
        }

        const token = kids[ndx].value;
        if (token.text === 'IN-PACKAGE') {
            this.processInPackage(kids[ndx + 2].value);
        } else if (token.text === 'DEFPACKAGE') {
            this.processDefPackage(kids.slice(ndx + 2));
        } else if (token.text === 'DEFUN') {
            this.processDefun(kids.slice(ndx + 2));
        } else if (token.type === types.LOAD) {
            // Ignore
        } else {
            console.log(`PackageMgr unhandled expr ${kids[ndx].value.text} ${kids[ndx].value.type} `);
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
        const pkg = new Package(name);

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

        if (token.text === ':EXPORT') {
            this.packageExports(pkg, node.kids.slice(ndx + 1));
        } else if (token.text === ':USE') {
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

            pkg.exports.push(name.toUpperCase());
        }
    }

    packageUses(pkg, nodes) {
        for (let ndx = 0; ndx < nodes.length; ndx += 1) {
            const token = nodes[ndx].value;
            if (token === undefined || token.type === types.WHITE_SPACE) {
                continue;
            }

            let name = (token.type === types.SYMBOL)
                ? token.text.substring(1).toUpperCase()
                : token.text.toUpperCase();

            if (name === 'CL' || name === 'COMMON-LISP' || name === 'COMMON-LISP-USER') {
                name = CL_USER_PKG;
            }

            pkg.uses.push(name);
        }
    }

    processInPackage(token) {
        let name = (token.type == types.SYMBOL) ? token.text.substring(1) : token.text;
        name = name.toUpperCase();

        if (name === 'COMMON-LISP-USER') {
            name = CL_USER_PKG;
        }

        if (this.pkgs[name] === undefined) {
            return;
        }

        if (this.curPackage !== undefined) {
            this.curPackage.endLine = token.start.line - 1;
        }

        this.curPackage = this.pkgs[name];
        this.curPackage.startLine = token.start.line;
    }
};
