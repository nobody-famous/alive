const { LispID, LispQuote, LispSymbol } = require('./LispID');
const { toWire } = require('./SwankUtils');

class SwankRequest {
    constructor(data) {
        this.data = data;
    }

    encode() {
        const len = this.data.length.toString(16).padStart(6, '0');

        return `${len}${this.data}`;
    }
};

module.exports.EmacsRex = class extends SwankRequest {
    constructor(msgID, data, pkg) {
        super('(' + toWire(new LispSymbol('emacs-rex')) + ' ' + data + ' ' + toWire(pkg) + ' ' + toWire(true) + ' ' + msgID + ')');
    }
};

module.exports.ConnectionInfoReq = class extends this.EmacsRex {
    constructor(msgID) {
        super(msgID, toWire([new LispID('swank:connection-info')]), new LispID('nil'));
    }
};

module.exports.EvalReq = class extends this.EmacsRex {
    constructor(msgID, form) {
        // super(msgID, toWire([new LispID('swank:interactive-eval'), form]), new LispID('nil'));
        super(msgID, toWire([new LispID('swank:eval-and-grab-output'), form]), new LispID('nil'));
    }
};
