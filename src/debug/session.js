const vscode = require('vscode');
const { DebugSession, OutputEvent, StackFrame, StoppedEvent, TerminatedEvent, Thread } = require('vscode-debugadapter');
const { SwankClient } = require('./SwankClient');
const { format } = require('util');

module.exports.Session = class extends DebugSession {
    constructor() {
        super();

        this.runtime = undefined;

        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }

    initializeRequest(resp, args) {
        resp.body.supportsDataBreakpoints = false;
        resp.body.supportsBreakpointLocationsRequest = false;

        this.sendResponse(resp);
    }

    async launchRequest(resp, args) {
        try {
            this.runtime = new SwankClient(args.host, args.port);

            this.runtime.on('msg', (msg) => this.sendEvent(new OutputEvent(msg)));
            this.runtime.on('error', (err) => vscode.window.showErrorMessage(err.toString()));
            this.runtime.on('close', () => this.sendEvent(new TerminatedEvent(false)));
            this.runtime.on('debug', (threadID) => this.sendEvent(new StoppedEvent('pause', threadID)));

            await this.runtime.connect();

            const connInfo = await this.runtime.start();

            this.updateConnInfo(connInfo);
            this.sendEvent(new StoppedEvent('launch'));
        } catch (err) {
            vscode.window.showErrorMessage(err);
        }

        this.sendResponse(resp);
    }

    async threadsRequest(resp) {
        const list = await this.runtime.listThreads();

        resp.body = {
            threads: [],
        };

        list.threads.forEach(thr => resp.body.threads.push(new Thread(thr.id, thr.name)));

        this.sendResponse(resp);
    }

    stackTraceRequest(resp, args, req) {
        const threadID = args.threadId;
        const threadInfo = this.runtime.threads[threadID];
        const frames = [];

        if (threadInfo !== undefined && threadInfo.frames !== undefined) {
            for (let n = 0; n < threadInfo.frames.length; n += 1) {
                const info = threadInfo.frames[n];
                frames.push(new StackFrame(n, info.text));
            }
        }

        resp.body = {
            stackFrames: frames,
            totalFrames: frames.length,
        };

        this.sendResponse(resp);
    }

    continueRequest(resp, args) {
        console.log('continueRequest');
        this.sendResponse(resp);
    }

    pauseRequest(resp, args) {
        console.log('pauseRequest');
        this.sendResponse(resp);
    }

    nextRequest(resp, args, req) {
        console.log('nextRequest');
        this.sendResponse(resp);
    }

    restartRequest(resp, args, req) {
        console.log('restartRequest');
        this.sendResponse(resp);
    }

    async evaluateRequest(resp, args, req) {
        const text = req.arguments.expression;
        const e = await this.runtime.eval(text);

        this.sendEvent(new OutputEvent(`\n${e.result}\n`));
        this.sendResponse(resp);
    }

    updateConnInfo(info) {
        if (info.package !== undefined && info.package.prompt !== undefined) {
            const prompt = `${info.package.prompt}>`;
            this.sendEvent(new OutputEvent(prompt));
        }
    }
};
