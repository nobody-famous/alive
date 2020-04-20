const { LispID, LispSymbol } = require('./LispID');

class SwankRequest {
    constructor(data) {
        this.data = data;
    }

    encode() {
        const form = this.toWire(this.data);
        const len = form.length.toString(16).padStart(6, '0');

        return `${len}${form}`;
    }

    toWire(item) {
        let str = '';

        if (Array.isArray(item)) {
            str += this.arrayToWire(item);
        } else if (item instanceof LispSymbol) {
            str += `:${item.id}`;
        } else if (item instanceof LispID) {
            str += `${item.id}`;
        } else if (typeof item === 'object') {
            str += this.objectToWire(item);
        } else if (typeof item === 'string') {
            str += `"${item}"`;
        } else if (item === true) {
            str += `t`;
        } else {
            str += item;
        }

        return str;
    }

    objectToWire(obj) {
        let str = '(';
        const keys = Object.keys(obj);

        for (let ndx = 0; ndx < keys.length - 1; ndx += 1) {
            const key = keys[ndx];

            str += `:${key} ${this.toWire(obj[key])} `;
        }

        const key = keys[keys.length - 1];
        str += `:${key} ${this.toWire(obj[key])}`;

        return str + ')';
    }

    arrayToWire(arr) {
        let str = '(';

        for (let ndx = 0; ndx < arr.length - 1; ndx += 1) {
            str += this.toWire(arr[ndx]) + ' ';
        }

        str += this.toWire(arr[arr.length - 1]) + ')';

        return str;
    }
};

module.exports.EmacsRex = class extends SwankRequest {
    constructor(msgID, form, pkg) {
        super([new LispSymbol('emacs-rex'), form, pkg, true, msgID]);
    }
};

module.exports.ConnectionInfoReq = class extends this.EmacsRex {
    constructor(msgID) {
        super(msgID, [new LispID('swank:connection-info')], new LispID('nil'));
    }
};
