const { LoggingDebugSession, OutputEvent, TerminatedEvent } = require('vscode-debugadapter');
const { SBCL } = require('./sbcl');

module.exports.Session = class extends LoggingDebugSession {
    constructor() {
        super('common-lisp-debug.txt');

        this.runtime = undefined;

        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }

    initializeRequest(resp, args) {
        this.sendResponse(resp);
    }

    launchRequest(resp, args) {
        this.runtime = new SBCL();

        this.runtime.on('msg', (msg) => this.sendEvent(new OutputEvent(msg)));
        this.runtime.on('close', () => this.sendEvent(new TerminatedEvent(false)));

        this.runtime.start();

        this.sendResponse(resp);
    }

    evaluateRequest(resp, args, req) {
        const text = req.arguments.expression;

        this.sendEvent(new OutputEvent(text));
        this.runtime.send(text);

        this.sendResponse(resp);
    }
};
