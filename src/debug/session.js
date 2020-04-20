const vscode = require('vscode');
const { LoggingDebugSession, OutputEvent, TerminatedEvent } = require('vscode-debugadapter');
const { SwankClient } = require('./SwankClient');
const { format } = require('util');

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

    async launchRequest(resp, args) {
        try {
            this.runtime = new SwankClient(args.host, args.port);

            this.runtime.on('msg', (msg) => this.sendEvent(new OutputEvent(msg)));
            this.runtime.on('error', (err) => vscode.window.showErrorMessage(err.toString()));
            this.runtime.on('close', () => this.sendEvent(new TerminatedEvent(false)));
            this.runtime.on('conn-info', (info) => vscode.window.showInformationMessage(format(info)));

            await this.runtime.connect();

            this.runtime.start();
        } catch (err) {
            vscode.window.showErrorMessage(err);
        }

        this.sendResponse(resp);
    }

    evaluateRequest(resp, args, req) {
        const text = req.arguments.expression;

        this.sendEvent(new OutputEvent(text));
        this.runtime.send(text);

        this.sendResponse(resp);
    }
};
