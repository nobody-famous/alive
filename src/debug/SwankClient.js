const fs = require('fs');
const { EventEmitter } = require('events');
const { SwankConn } = require('./SwankConn');
const { format } = require('util');

module.exports.SwankClient = class extends EventEmitter {
    constructor(host, port) {
        super();

        this.host = host;
        this.port = port;
        this.replConn = undefined;
        this.threads = {};
    }

    async start() {
        try {
            if (this.replConn !== undefined) {
                return;
            }

            this.replConn = new SwankConn(this.host, this.port);

            this.replConn.on('error', (err) => this.emit('error', err));
            this.replConn.on('close', () => this.emit('close'));
            this.replConn.on('debug', (event) => this.debugEvent(event));
            this.replConn.on('activate', (event) => this.activateEvent(event));

            await this.replConn.connect();
        } catch (err) {
            this.emit('error', format(err));
        }
    }

    getPrompt() {
        return (this.replConn.info !== undefined && this.replConn.info.package !== undefined)
            ? this.replConn.info.package.prompt
            : '';
    }

    async debugEvent(event) {
        if (this.threads[event.threadID] === undefined) {
            await this.listThreads();
        }

        if (this.threads[event.threadID] !== undefined) {
            this.threads[event.threadID].debug = event;
        }
    }

    activateEvent(event) {
        this.emit('debug', event.threadID);
    }

    threadStackTrace(threadID) {
        const thr = this.threads[threadID];

        if (thr === undefined || thr.debug === undefined) {
            return [];
        }

        return thr.debug.frames.map(frame => frame.text);
    }

    threadCondition(threadID) {
        const thr = this.threads[threadID];

        if (thr === undefined || thr.debug === undefined) {
            return undefined;
        }

        let str = '';
        for (let ndx = 0; ndx < thr.debug.condition.length - 1; ndx += 1) {
            str += `${thr.debug.condition[ndx]}\n`;
        }

        return [str];
    }

    async eval(str) {
        try {
            const res = await this.replConn.eval(str);

            if (res !== undefined && res.result !== undefined) {
                this.emit('msg', res.result);
            }
        } catch (err) {
            this.emit('error', format(err));
        }
    }

    async listThreads() {
        const list = await this.replConn.listThreads();

        this.initThreads(list.info);

        return list;
    }

    async initThreads(info) {
        for (let ndx = 0; ndx < info.length; ndx += 1) {
            const thr = info[ndx];
            const obj = {
                ndx,
                name: thr.name,
                status: thr.status,
            };

            if (this.threads[thr.id] === undefined) {
                this.threads[thr.id] = obj;
            } else {
                this.threads[thr.id].ndx = ndx;
                this.threads[thr.id].name = thr.name;
                this.threads[thr.id].status = thr.status;
            }
        }
    }

    async debugThread(threadID) {
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

    locals(threadID, frameID) {
        if (this.threads[threadID] === undefined || this.threads[threadID].ndx === undefined) {
            return undefined;
        }

        return this.replConn.frameLocals(threadID, frameID);
    }
};
