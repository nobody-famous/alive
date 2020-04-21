const net = require('net');
const { EventEmitter } = require('events');
const { ConnectionInfoReq, EmacsRex, EvalReq } = require('./SwankRequest');
const { ConnectionInfo } = require('./ConnectionInfo');
const { Eval } = require('./Eval');
const { SwankResponse } = require('./SwankResponse');
const { format } = require('util');

module.exports.SwankClient = class extends EventEmitter {
    constructor(host, port) {
        super();

        this.host = host;
        this.port = port;
        this.conn = undefined;
        this.msgID = 1;
        this.curResponse = undefined;
        this.buffer = undefined;
        this.reqs = {};
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.conn = net.createConnection(this.port, this.host, () => {
                this.connected = true;
                resolve();
            });

            this.conn.on('error', (err) => {
                if (!this.conn.connected) {
                    reject(`Connect to REPL failed: ${err.toString()}`);
                } else {
                    this.emit('error', `REPL Connection error ${err.toString()}`);
                }
            });

            this.conn.on('close', () => this.emit('close'));

            this.conn.on('data', (data) => {
                try {
                    this.addToBuffer(data);
                    this.readResponses();
                } catch (err) {
                    this.emit('error', err);
                }
            });
        });
    }

    addToBuffer(data) {
        this.buffer = (this.buffer === undefined)
            ? data
            : Buffer.concat([this.buffer, data]);
    }

    readResponses() {
        while (this.buffer.length > 0) {
            this.readResponse();

            if (this.curResponse !== undefined && this.curResponse.hasAllData()) {
                const event = this.curResponse.parse();

                this.processEvent(event);
                this.curResponse = undefined;
            }
        }
    }

    readResponse() {
        if (this.curResponse === undefined) {
            this.curResponse = new SwankResponse();
            this.buffer = this.curResponse.readHeader(this.buffer);
        }

        this.buffer = this.curResponse.addData(this.buffer);
    }

    processEvent(event) {
        if (event === undefined) {
            return;
        }

        if (event.op === ':RETURN') {
            this.processReturn(event);
        } else if (event.op === ':DEBUG') {
            this.processDebug(event);
        } else {
            console.log(this.curResponse);
        }
    }

    processDebug(event) {
        this.emit('msg', format(event));
    }

    processReturn(event) {
        try {
            const req = this.reqForID(event.msgID);
            const [status, args] = event.info;

            this.checkReturnStatus(status);

            if (req instanceof ConnectionInfoReq) {
                this.emit('conn-info', new ConnectionInfo(args));
            } else if (req instanceof EvalReq) {
                this.emit('eval', new Eval(args));
            } else {
                this.emit('msg', args);
            }
        } catch (err) {
            this.emit('error', err);
        }
    }

    checkReturnStatus(status) {
        if (status !== ':OK') {
            throw new Error(`Request failed with ${status}`);
        }
    }

    reqForID(id) {
        const req = this.reqs[id];

        if (req === undefined) {
            throw new Error(`No request for response ${id}`);
        }

        delete this.reqs[id];

        return req;
    }

    start() {
        try {
            const id = this.nextID();
            const req = new ConnectionInfoReq(id);
            const msg = req.encode();

            this.sendMessage(id, msg, req);
        } catch (err) {
            this.emit('error', err);
        }
    }

    send(data) {
        const id = this.nextID();
        const req = new EvalReq(id, data);
        const msg = req.encode();

        this.sendMessage(id, msg, req);
    }

    sendMessage(id, msg, req) {
        this.conn.write(msg, (err) => {
            if (err) {
                this.emit('error', err);
            } else {
                this.reqs[id] = req;
            }
        });
    }

    nextID() {
        const id = this.msgID;

        this.msgID += 1;

        return id;
    }
};
