const net = require('net');
const fs = require('fs');
const { EventEmitter } = require('events');
const {
    ConnectionInfoReq,
    DebuggerInfoReq,
    DebugThreadReq,
    EvalReq,
    FrameLocalsReq,
    ThreadsReq
} = require('./SwankRequest');
const { ConnectionInfo } = require('./ConnectionInfo');
const { Eval } = require('./Eval');
const { Locals } = require('./Locals');
const { Threads } = require('./Threads');
const { DebuggerInfo } = require('./DebuggerInfo');
const { SwankResponse } = require('./SwankResponse');
const { format } = require('util');

module.exports.SwankClient = class extends EventEmitter {
    constructor(host, port) {
        super();

        this.trace = true;

        this.host = host;
        this.port = port;
        this.conn = undefined;
        this.connInfo = undefined;
        this.curResponse = undefined;
        this.buffer = undefined;
        this.handlers = {};
        this.threads = {};

        this.activeThread = undefined;
        this.msgID = 1;
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
                if (this.trace) {
                    console.log(`<-- ${this.curResponse.buf.toString()}`);
                }
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
        } else if (event.op === ':DEBUG-ACTIVATE') {
            this.processDebugActivate(event);
        } else {
            console.log(`processEvent op ${event.op}`);
        }
    }

    async processDebugActivate(event) {
        try {
            this.activeThread = event.threadID;
            const info = await this.debuggerInfo(event.threadID, event.level);
        } catch (err) {
            this.emit('msg', err.toString());
        }
    }

    async debuggerInfo(threadID, level) {
        try {
            const req = new DebuggerInfoReq(threadID, 0, 10);
            const resp = await this.sendRequest(req);

            return new DebuggerInfo(resp);
        } catch (err) {
            this.emit('error', err);
        }
    }

    processDebug(event) {
        this.threads[event.threadID] = {
            condition: event.condition,
            restarts: event.restarts,
            frames: event.frames,
        };

        this.emit('msg', `\n${event.condition.join('\n')}`);
        this.emit('debug', event.threadID);
    }

    processReturn(event) {
        try {
            const handler = this.handlerForID(event.id);
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

            delete this.handlers[event.id];
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
            const req = new ConnectionInfoReq();
            const resp = await this.sendRequest(req);

            this.connInfo = new ConnectionInfo(resp);

            if (this.connInfo.package !== undefined && this.connInfo.package.prompt !== undefined) {
                this.emit('set_prompt', this.connInfo.package.prompt);
            }
        } catch (err) {
            this.emit('error', err);
        }
    }

    async eval(data) {
        try {
            const req = new EvalReq(data);
            const resp = await this.sendRequest(req);

            return new Eval(resp);
        } catch (err) {
            this.emit('error', err);
        }
    }

    async listThreads() {
        try {
            const req = new ThreadsReq();
            const resp = await this.sendRequest(req);
            const threads = new Threads(resp);

            await this.initThreads(threads.info);

            return threads;
        } catch (err) {
            this.emit('error', err);
        }
    }

    async initThreads(info) {
        this.threads = info;
    }

    async debugThread(threadID) {
        try {
            const ndx = this.threadIndexForId(threadID);
            if (ndx === undefined) {
                console.log(`No thread for id ${threadID}`);
                return;
            }

            const req = new DebugThreadReq(ndx, this.connInfo.pid);
            const resp = await this.sendRequest(req);

            // console.log(`send debug thread ${req.encode()}`);
            // await this.writeMessage(req.encode());

            // const resp = await this.waitForResponse(id);
            console.log('debugThread', resp);
            const port = this.readPortFile(`/tmp/slime.${this.connInfo.pid}`);
            console.log(`port ${port}`);
            const client = new exports.SwankClient('localhost', port);
            await client.connect();
            console.log('client connected');
            await client.start();
            console.log('client', client.connInfo);
            console.log('client info', await client.debuggerInfo(ndx));
            // await this.debuggerInfo(ndx);
        } catch (err) {
            this.emit('error', err);
        }
    }

    readPortFile(file) {
        try {
            const text = fs.readFileSync(file);
            const port = parseInt(text);

            return Number.isNaN(port) ? undefined : port;
        } catch (err) {
            this.emit('error', err);
        }
    }

    threadIndexForId(id) {
        for (let ndx = 0; ndx < this.threads.length; ndx += 1) {
            const thr = this.threads[ndx];

            if (thr.id === id) {
                return ndx;
            }
        }

        return undefined;
    }

    async locals(frameID) {
        try {
            const req = new FrameLocalsReq(this.activeThread, frameID);
            const resp = await this.sendRequest(req);

            return new Locals(resp);
        } catch (err) {
            this.emit('error', err);
        }
    }

    async sendRequest(req) {
        const id = this.nextID();
        const msg = req.encode(id);

        await this.writeMessage(msg);
        return this.waitForResponse(id);
    }

    waitForResponse(id) {
        return new Promise((resolve, reject) => {
            this.handlers[id] = { resolve, reject };
        });
    }

    writeMessage(msg) {
        return new Promise((resolve, reject) => {
            if (this.trace) {
                console.log(`--> ${msg}`);
            }

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
