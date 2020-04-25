const types = require('../Types');
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
