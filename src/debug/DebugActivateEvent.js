module.exports.DebugActivateEvent = class {
    constructor(data) {
        this.op = data[0];
        this.threadID = parseInt(data[1]);
        this.level = parseInt(data[2]);
        this.select = data[3];
    }
};
