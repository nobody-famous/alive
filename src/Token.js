module.exports.Token = class {
    constructor(type, start, end, text) {
        this.type = type;
        this.start = start;
        this.end = end;
        this.text = text;
    }
};
