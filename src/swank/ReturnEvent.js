const { convert, convertArray, plistToObj } = require('./SwankUtils');

module.exports.ReturnEvent = class {
    constructor(data) {
        this.op = data[0];
        this.info = data[1];
        this.id = convert(data[2]);
    }
};
