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

    listThreads() {
        return this.replConn.listThreads();
    }

    async initThreads(info) {
        this.threads = info;
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

    async locals(frameID) {
    }
};
