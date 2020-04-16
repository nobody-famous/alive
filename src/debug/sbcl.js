const cp = require('child_process');
const { format } = require('util');
const { EventEmitter } = require('events');

module.exports.SBCL = class extends EventEmitter {
    constructor() {
        super();

        this.proc = undefined;
    }

    start() {
        this.proc = cp.spawn('sbcl');

        this.proc.on('close', () => this.emit('close'));
        this.proc.on('error', (err) => this.emit('msg', `Process error ${format(err)}`));

        this.proc.stdout.on('data', (data) => this.emit('msg', data.toString()));
    }

    send(text) {
        if (this.proc === undefined) {
            return;
        }

        this.proc.stdin.write(text + '\n');
    }
};
