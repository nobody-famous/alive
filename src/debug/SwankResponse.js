const types = require('../Types');
const { plistToObj, convertArray, convert } = require('./SwankUtils');
const { Lexer } = require('../Lexer');
const { Parser } = require('../lisp/Parser');
const { ReturnEvent } = require('./ReturnEvent');
const { DebugEvent } = require('./DebugEvent');
const { DebugActivateEvent } = require('./DebugActivateEvent');
const { format } = require('util');

module.exports.SwankResponse = class {
    constructor() {
        this.length = undefined;
        this.buf = undefined;
        this.op = undefined;
        this.data = undefined;
    }

    parse() {
        const lex = new Lexer(this.buf.toString());
        const tokens = lex.getTokens();
        const parser = new Parser(tokens);
        const ast = parser.parse();
        const arr = this.astToArray(ast);
        const event = arr[0].toUpperCase();

        if (event === ':RETURN') {
            return new ReturnEvent(arr);
        } else if (event === ':DEBUG') {
            return new DebugEvent(arr);
        } else if (event === ':DEBUG-ACTIVATE') {
            return new DebugActivateEvent(arr);
        } else {
            console.log(`UNHANDLED RESPONSE EVENT ${event}`);
            return undefined;
        }
    }

    astToArray(ast) {
        const arr = [];

        ast.nodes.forEach(node => {
            const value = this.nodeToArray(node);

            if (value !== undefined) {
                arr.push(value);
            }
        });

        return (arr.length === 1) ? arr[0] : arr;
    }

    nodeToArray(node) {
        if (node.value !== undefined && node.value.type !== types.WHITE_SPACE) {
            return node.value.text;
        }

        if (node.kids.length > 0) {
            const arr = [];

            node.kids.forEach(kid => {
                const value = this.nodeToArray(kid);

                if (value !== undefined) {
                    arr.push(value);
                }
            });

            return arr;
        }

        return undefined;
    }

    addData(data) {
        const diff = (this.buf === undefined) ? this.length : this.length - this.buf.length;
        const toCopy = data.slice(0, diff);
        const remaining = data.slice(diff);

        this.buf = (this.buf === undefined)
            ? toCopy
            : Buffer.concat([this.buf, toCopy]);

        return remaining;
    }

    hasAllData() {
        if (this.buf === undefined || this.length === undefined) {
            return false;
        }

        return this.buf.length >= this.length;
    }

    readHeader(data) {
        const header = data.slice(0, 6);
        const remaining = data.slice(6);

        this.length = parseInt(header.toString(), 16);

        if (Number.isNaN(this.length)) {
            this.length = undefined;
            throw new Error(`Invalid message header "${header.toString()}"`);
        }

        return remaining;
    }
};

module.exports.EvalResp = class {
    constructor(data) {
        let count = 0;

        for (let ndx = 0; ndx < data.length; ndx += 1) {
            if (data[ndx] === '""') {
                count += 1;
            }
        }

        data.splice(0, count);
        this.result = convertArray(data).join('\n');
    }
};

module.exports.ConnectionInfoResp = class {
    constructor(data) {
        const obj = plistToObj(data);

        this.pid = (obj.pid !== undefined) ? parseInt(obj.pid) : undefined;

        if (obj.encoding !== undefined) {
            this.encoding = plistToObj(obj.encoding);
            this.encoding.coding_systems = convertArray(this.encoding.coding_systems);
        }

        this.impl = plistToObj(obj.lisp_implementation);
        this.machine = plistToObj(obj.machine);
        this.package = plistToObj(obj.package);

        this.style = obj.style;
        this.features = convertArray(obj.features);
        this.modules = convertArray(obj.modules);
        this.version = obj.version;
    }
};

module.exports.LocalsResp = class {
    constructor(data) {
        this.vars = this.fromArray(data[0]);
        this.catchTags = data[1];
    }

    fromArray(arr) {
        return arr.map((item) => plistToObj(item));
    }
};

module.exports.ThreadsResp = class {
    constructor(data) {
        this.headers = data[0];
        this.info = [];

        for (let ndx = 1; ndx < data.length; ndx += 1) {
            const [id, name, status] = data[ndx];

            this.info.push({
                id: parseInt(id),
                name,
                status,
            });
        }
    }
};

module.exports.DebuggerInfoResp = class {
    constructor(data) {
        console.log('DebuggerInfo', data);
    }
};
