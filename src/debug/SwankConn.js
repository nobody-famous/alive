const net = require('net');
const { EventEmitter } = require('events');
const {
    SwankResponse,
    ConnectionInfoResp,
    DebuggerInfoResp,
    EvalResp,
    LocalsResp,
    ThreadsResp,
} = require('./SwankResponse');
const {
    ConnectionInfoReq,
    DebuggerInfoReq,
    DebugThreadReq,
    EvalReq,
    FrameLocalsReq,
    ThreadsReq
} = require('./SwankRequest');

module.exports.SwankConn = class extends EventEmitter {
    constructor(host, port) {
        super();

        this.host = host;
        this.port = port;

        this.trace = false;

        this.conn = undefined;
        this.info = undefined;
        this.handlers = {};
        this.msgID = 1;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.conn = net.createConnection(this.port, this.host, async () => {
                try {
                    this.info = await this.connectionInfo();
                } catch (err) {
                    return reject(`Failed to get connection info ${err.toString()}`);
                }
                resolve();
            });

            this.conn.on('error', (err) => this.connError(err));
            this.conn.on('close', () => this.connClosed());
            this.conn.on('data', (data) => this.readData(data));
        });
    }

    async connectionInfo() {
        const req = new ConnectionInfoReq();
        const resp = await this.sendRequest(req);

        return new ConnectionInfoResp(resp);
    }

    async eval(str) {
        const req = new EvalReq(str);
        const resp = await this.sendRequest(req);

        return new EvalResp(resp);
    }

    async listThreads() {
        const req = new ThreadsReq();
        const resp = await this.sendRequest(req);

        return new ThreadsResp(resp);
    }

    async debugThread(ndx, file) {
        const req = new DebugThreadReq(ndx, file);
        return this.sendRequest(req);
    }

    async frameLocals(threadID, frameID) {
        const req = new FrameLocalsReq(threadID, frameID);
        const resp = await this.sendRequest(req);

        return new LocalsResp(resp);
    }

    async debuggerInfo(threadID, level) {
        const req = new DebuggerInfoReq(threadID, 0, 10);
        const resp = await this.sendRequest(req);

        return new DebuggerInfoResp(resp);
    }

    connError(err) {
        this.emit('error', `REPL Connection error ${err.toString()}`);
    }

    connClosed() {
        this.conn = undefined;
        this.emit('close');
    }

    readData(data) {
        try {
            this.addToBuffer(data);
            this.readResponses();
        } catch (err) {
            this.emit('error', err);
        }
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
            console.log('processDebugActivate NOT DONE');
            // this.activeThread = event.threadID;
            // const info = await this.debuggerInfo(event.threadID, event.level);
        } catch (err) {
            this.emit('msg', err.toString());
        }
    }

    processDebug(event) {
        console.log('processDebug NOT DONE');
        // this.threads[event.threadID] = {
        //     condition: event.condition,
        //     restarts: event.restarts,
        //     frames: event.frames,
        // };

        // this.emit('msg', `\n${event.condition.join('\n')}`);
        // this.emit('debug', event.threadID);
    }

    processReturn(event) {
        try {
            const { resolve, reject } = this.handlerForID(event.id);
            const [status, args] = event.info;

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

        if (handler === undefined) {
            throw `No handler for message ${id}`;
        }

        return handler;
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
