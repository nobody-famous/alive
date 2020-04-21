module.exports.ReturnEvent = class {
    constructor(data) {
        this.op = data[0];
        this.info = data[1];
        this.msgID = parseInt(data[2]);
    }
};
