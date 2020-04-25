const vscode = require('vscode');
const { DebugSession, OutputEvent, StackFrame, StoppedEvent, TerminatedEvent, Thread } = require('vscode-debugadapter');
const { SwankClient } = require('./SwankClient');
const { format } = require('util');

const MAX_THREAD = 0x7fffff;

module.exports.DebugSession = class extends DebugSession {
    constructor() {
        super();

        this.runtime = undefined;
        this.prompt = undefined;

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
            this.runtime.on('set_prompt', (prompt) => this.updatePrompt(prompt));

            await this.runtime.connect();
            await this.runtime.start();

            this.sendEvent(new StoppedEvent('launch'));
        } catch (err) {
            vscode.window.showErrorMessage(format(err));
        }

        this.sendResponse(resp);
    }

    updatePrompt(prompt) {
        this.prompt = prompt;
        this.sendEvent(new OutputEvent(`${prompt}>`));
    }

    async threadsRequest(resp) {
        const list = await this.runtime.listThreads();

        resp.body = {
            threads: [],
        };

        list.info.forEach(thr => resp.body.threads.push(new Thread(thr.id, thr.name)));

        this.sendResponse(resp);
    }

    stackTraceRequest(resp, args, req) {
        const threadID = args.threadId;
        const threadInfo = this.runtime.threads[threadID];
        const frames = [];

        if (threadInfo !== undefined && threadInfo.frames !== undefined) {
            for (let n = 0; n < threadInfo.frames.length; n += 1) {
                const info = threadInfo.frames[n];
                frames.push(new StackFrame(parseFloat(`${(threadID << 8) + n}`), info.text));
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

    async scopesRequest(resp, args, req) {
        const frameID = args.frameId;
        const locals = await this.runtime.locals(frameID);

        resp.body = {
            scopes: [
                {
                    name: 'Locals',
                    presentationHint: 'locals',
                    variablesReference: frameID,
                    namedVariables: locals.vars.length,
                    expensive: false,
                }
            ],
        };

        this.sendResponse(resp);
    }

    variablesRequest(resp, args) {
        console.log('variablesRequest', args);

        this.sendResponse(resp);
    }

    async pauseRequest(resp, args) {
        await this.runtime.debugThread(args.threadId);
        // const info = await this.runtime.debuggerInfo(args.threadId);

        // console.log('pause', info);

        this.sendEvent(new StoppedEvent('pause', args.threadId));
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

        if (e !== undefined && e.result !== undefined) {
            this.sendEvent(new OutputEvent(`\n${e.result}\n`));
        }
        this.sendResponse(resp);
    }
};
