const net = require('net');
const { EventEmitter } = require('events');
const { ConnectionInfoReq } = require('./SwankRequest');
const { ConnectionInfo } = require('./ConnectionInfo');
const { SwankResponse } = require('./SwankResponse');

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
                this.curResponse.parse();
                this.processResponse();
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

    processResponse() {
        console.log(`PROCESS ${this.curResponse.op}`);
        if (this.curResponse.op === ':RETURN') {
            this.processReturn(this.curResponse.msgID, this.curResponse.data);
        }
    }

    processReturn(id, data) {
        try {
            const req = this.reqForID(id);
            const [status, args] = data;

            this.checkReturnStatus(status);

            if (req instanceof ConnectionInfoReq) {
                this.emit('conn-info', new ConnectionInfo(args));
            }
        } catch (err) {
            console.log(err);
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

            this.conn.write(msg, (err) => {
                if (err) {
                    this.emit('error', err);
                } else {
                    this.reqs[id] = req;
                }
            });
        } catch (err) {
            this.emit('error', err);
        }
    }

    nextID() {
        const id = this.msgID;

        this.msgID += 1;

        return id;
    }
};
