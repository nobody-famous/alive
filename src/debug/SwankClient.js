const net = require('net');
const { EventEmitter } = require('events');
const { ConnectionInfoReq, EvalReq, ThreadsReq } = require('./SwankRequest');
const { ConnectionInfo } = require('./ConnectionInfo');
const { Eval } = require('./Eval');
const { Threads } = require('./Threads');
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
        this.handlers = {};
        this.threads = {};
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
        this.threads[event.threadID] = {
            condition: event.condition,
            restarts: event.restarts,
            frames: event.frames,
        };

        this.emit('debug', event.threadID);
    }

    processReturn(event) {
        try {
            const handler = this.handlerForID(event.msgID);
            const [status, args] = event.info;

            if (handler === undefined) {
                return;
            }

            const { resolve, reject } = handler;
            if (status === ':OK') {
                resolve(args);
            } else {
                reject(status);
            }
        } catch (err) {
            this.emit('error', err);
        }
    }

    handlerForID(id) {
        const handler = this.handlers[id];

        if (handler !== undefined) {
            delete this.handlers[id];
        }

        return handler;
    }

    async start() {
        try {
            const id = this.nextID();
            const req = new ConnectionInfoReq(id);

            await this.writeMessage(req.encode());

            const resp = await this.waitForResponse(id);
            return new ConnectionInfo(resp);
        } catch (err) {
            this.emit('error', err);
        }
    }

    async eval(data) {
        try {
            const id = this.nextID();
            const req = new EvalReq(id, data);

            await this.writeMessage(req.encode());

            const resp = await this.waitForResponse(id);
            return new Eval(resp);
        } catch (err) {
            this.emit('error', err);
        }
    }

    async listThreads() {
        try {
            const id = this.nextID();
            const req = new ThreadsReq(id);

            await this.writeMessage(req.encode());

            const resp = await this.waitForResponse(id);
            return new Threads(resp);
        } catch (err) {
            this.emit('error', err);
        }
    }

    waitForResponse(id) {
        return new Promise((resolve, reject) => {
            this.handlers[id] = { resolve, reject };
        });
    }

    writeMessage(msg) {
        return new Promise((resolve, reject) => {
            this.conn.write(msg, (err) => {
                if (err) {
                    return reject(err);
                }

                resolve();
            });
        });
    }

    nextID() {
        const id = this.msgID;

        this.msgID += 1;

        return id;
    }
};
