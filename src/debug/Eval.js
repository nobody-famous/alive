const { convertArray } = require('./SwankUtils');

module.exports.Eval = class {
    constructor(data) {
        this.result = convertArray(data).join('\n');
    }
};
