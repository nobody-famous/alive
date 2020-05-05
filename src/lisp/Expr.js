class Expr {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
};

module.exports.posInExpr = (expr, pos) => {
    if (pos.line === expr.start.line) {
        return pos.character >= expr.start.character;
    }

    if (pos.line === expr.end.line) {
        return pos.character <= expr.end.character;
    }

    return (pos.line >= expr.start.line && pos.line <= expr.end.line);
};

module.exports.findExpr = (exprs, pos) => {
    for (let ndx = 0; ndx < exprs.length; ndx += 1) {
        const expr = exprs[ndx];

        if (exports.posInExpr(expr, pos)) {
            return expr;
        }
    }

    return undefined;
}

module.exports.Atom = class extends Expr {
    constructor(start, end, value) {
        super(start, end);

        this.value = value;
    }
};

module.exports.SExpr = class extends Expr {
    constructor(start, end, parts) {
        super(start, end);

        this.parts = parts;
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

module.exports.Let = class extends Expr {
    constructor(start, end, vars, body) {
        super(start, end);

        this.vars = vars;
        this.body = body;
    }
};
