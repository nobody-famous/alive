module.exports.LispSymbol = class {
    constructor(id) {
        this.id = id;
    }
};

module.exports.LispID = class {
    constructor(id) {
        this.id = id;
    }
};

module.exports.LispQuote = class {
    constructor(form) {
        this.form = form;
    }
};
