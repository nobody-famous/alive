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
            this.runtime.on('conn-info', (info) => this.updateConnInfo(info));
            this.runtime.on('eval', (e) => this.sendEvent(new OutputEvent(`\n${e.result}\n`)));

            await this.runtime.connect();

            this.runtime.start();
        } catch (err) {
            vscode.window.showErrorMessage(err);
        }

        this.sendResponse(resp);
    }

    updateConnInfo(info) {
        if (info.package !== undefined && info.package.prompt !== undefined) {
            const prompt = `${info.package.prompt}>`;
            this.sendEvent(new OutputEvent(prompt));
        }
    }

    evaluateRequest(resp, args, req) {
        const text = req.arguments.expression;

        this.runtime.send(text);
        this.sendResponse(resp);
    }
};
