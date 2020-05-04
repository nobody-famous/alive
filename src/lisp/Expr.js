class Expr {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
};

module.exports.Atom = class extends Expr {
    constructor(start, end, value) {
        super(start, end);

        this.value = value;
    }
};

module.exports.DefPackage = class extends Expr {
    constructor(start, end, name, uses, exps) {
        super(start, end);

        this.name = name;
        this.uses = uses;
        this.exports = exps;
    }
};

module.exports.InPackage = class extends Expr {
    constructor(start, end, name) {
        super(start, end);

        this.name = name;
    }
};

module.exports.Defun = class extends Expr {
    constructor(start, end, name, args, body) {
        super(start, end);

        this.name = name;
        this.args = args;
        this.body = body;
    }
};

module.exports.If = class extends Expr {
    constructor(start, end, cond, trueExpr, falseExpr) {
        super(start, end);

        this.cond = cond;
        this.trueExpr = trueExpr;
        this.falseExpr = falseExpr;
    }
};
