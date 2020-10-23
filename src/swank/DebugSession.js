const vscode = require('vscode');
const { SwankClient } = require('./SwankClient');
const { format } = require('util');
const {
    DebugSession,
    OutputEvent,
    Scope,
    StackFrame,
    StoppedEvent,
    TerminatedEvent,
    Thread,
    Variable,
} = require('vscode-debugadapter');

const MAX_THREAD = 0x7fffff;

module.exports.DebugSession = class extends DebugSession {
    constructor() {
        super();

        this.runtime = undefined;

        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }

    customRequest(name) {
        console.log(`customRequest ${name}`);
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
            this.runtime.on('activate', (threadID) => this.handleActivateEvent(threadID));

            await this.runtime.start();
            this.showPrompt();

            this.sendEvent(new StoppedEvent('launch'));
        } catch (err) {
            vscode.window.showErrorMessage(format(err));
        }

        this.sendResponse(resp);
    }

    async handleActivateEvent(threadID) {
        await this.runtime.listThreads();

        this.sendEvent(new StoppedEvent('pause', threadID))
    }

    showPrompt() {
        const prompt = this.runtime.getPrompt();

        this.sendEvent(new OutputEvent(`${prompt}>`));
    }

    async threadsRequest(resp) {
        const list = await this.runtime.listThreads();

        resp.body = {
            threads: [],
        };

        if (list !== undefined) {
            list.info.forEach(thr => resp.body.threads.push(new Thread(thr.id, thr.name)));
        }

        this.sendResponse(resp);
    }

    stackTraceRequest(resp, args, req) {
        const frames = [];
        const stack = this.runtime.threadStackTrace(args.threadId);

        for (let n = 0; n < 0x100 && n < stack.length; n += 1) {
            const text = stack[n];
            const frameID = this.encodeFrameID(args.threadId, n);

            frames.push(new StackFrame(frameID, text));
        }

        resp.body = {
            stackFrames: frames,
            totalFrames: frames.length,
        };

        this.sendResponse(resp);
    }

    encodeFrameID(threadID, frameNum, scope = 0) {
        return (threadID << 12) + (frameNum << 4) + scope;
    }

    decodeFrameID(frameID) {
        return {
            threadID: (frameID >> 12),
            frameNum: (frameID >> 4) & 0xff,
            scope: (frameID & 0xf),
        };
    }

    continueRequest(resp, args) {
        console.log('continueRequest');
        this.sendResponse(resp);
    }

    async scopesRequest(resp, args, req) {
        const { threadID, frameNum } = this.decodeFrameID(args.frameId);

        resp.body = {
            scopes: [
                new Scope('Locals', this.encodeFrameID(threadID, frameNum, 1), false),
                new Scope('Condition', this.encodeFrameID(threadID, frameNum, 2), false),
                new Scope('Catch Tags', this.encodeFrameID(threadID, frameNum, 3), false),
                new Scope('Restarts', this.encodeFrameID(threadID, frameNum, 4), false),
            ],
        };

        this.sendResponse(resp);
    }

    async variablesRequest(resp, args) {
        const { threadID, frameNum, scope } = this.decodeFrameID(args.variablesReference);

        resp.body = {};

        if (scope === 1) {
            resp.body.variables = await this.localVariables(threadID, frameNum);
        } else if (scope === 2) {
            resp.body.variables = this.conditionAsVariable(threadID);
        } else if (scope === 3) {
            resp.body.variables = [];
        } else if (scope === 4) {
            resp.body.variables = this.restartsAsVariables(threadID, frameNum);
        }

        this.sendResponse(resp);
    }

    restartsAsVariables(threadID, frameNum) {
        const restarts = this.runtime.threadRestarts(threadID, frameNum);
        const vars = [];

        for (let ndx = 0; ndx < restarts.length; ndx += 1) {
            vars.push(new Variable(ndx.toString(), restarts[ndx]));
        }

        return vars;
    }

    conditionAsVariable(threadID) {
        const cond = this.runtime.threadCondition(threadID);

        return Array.isArray(cond)
            ? cond.map(c => new Variable('', c))
            : [];
    }

    async localVariables(threadID, frameNum) {
        const locals = await this.runtime.locals(threadID, frameNum);

        return Array.isArray(locals.vars)
            ? locals.vars.map(v => new Variable(v.name, v.value))
            : [];
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
