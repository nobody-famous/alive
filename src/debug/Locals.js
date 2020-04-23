const { convert, convertArray, plistToObj } = require('./SwankUtils');

module.exports.Locals = class {
    constructor(data) {
        this.vars = this.fromArray(data[0]);
        this.catchTags = data[1];
    }

    fromArray(arr) {
        return arr.map((item) => plistToObj(item));
    }
};
