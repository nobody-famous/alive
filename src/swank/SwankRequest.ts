import { LispID, LispSymbol } from './LispID'
import { toWire } from './SwankUtils'

export class SwankRequest {
    msgID: number
    data: string[]

    constructor(msgID: number, data: string[]) {
        this.msgID = msgID
        this.data = data
    }

    encode() {
        this.data.push(toWire(this.msgID))

        const str = `(${this.data.join(' ')})`
        const len = str.length.toString(16).padStart(6, '0')

        return `${len}${str}`
    }
}

export class EmacsRex extends SwankRequest {
    constructor(msgID: number, data: string, pkg: any, threadID: number | boolean) {
        super(msgID, [toWire(new LispSymbol('emacs-rex')), data, toWire(pkg), toWire(threadID)])
    }
}

export class SetPackageReq extends EmacsRex {
    constructor(msgID: number, pkg?: string) {
        super(msgID, toWire([new LispID('swank:set-package'), new LispID(pkg ?? '')]), new LispID(pkg ?? 'nil'), true)
    }
}

export class ListPackagesReq extends EmacsRex {
    constructor(msgID: number, pkg?: string) {
        super(
            msgID,
            toWire([new LispID('swank:list-all-package-names'), true, new LispID(pkg ?? '')]),
            new LispID(pkg ?? 'nil'),
            true
        )
    }
}

export class DocSymbolReq extends EmacsRex {
    constructor(msgID: number, symbol: string, pkg?: string) {
        super(msgID, toWire([new LispID('swank:documentation-symbol'), symbol]), new LispID(pkg ?? 'nil'), true)
    }
}

export class CompletionsReq extends EmacsRex {
    constructor(msgID: number, prefix: string, pkg: string) {
        super(msgID, toWire([new LispID('swank:simple-completions'), prefix, pkg]), new LispID(pkg ?? 'nil'), true)
    }
}

export class OpArgsReq extends EmacsRex {
    constructor(msgID: number, name: string, pkg: string) {
        super(msgID, toWire([new LispID('swank:operator-arglist'), name, pkg]), new LispID(pkg ?? 'nil'), true)
    }
}

export class ConnectionInfoReq extends EmacsRex {
    constructor(msgID: number, pkg?: string) {
        super(msgID, toWire([new LispID('swank:connection-info')]), new LispID(pkg ?? 'nil'), true)
    }
}

export class EvalReq extends EmacsRex {
    constructor(msgID: number, form: string, pkg?: string) {
        super(msgID, toWire([new LispID('swank:eval-and-grab-output'), form]), new LispID(pkg ?? 'nil'), true)
    }
}

export class ThreadsReq extends EmacsRex {
    constructor(msgID: number, pkg?: string) {
        super(msgID, toWire([new LispID('swank:list-threads')]), new LispID(pkg ?? 'nil'), true)
    }
}

export class FrameLocalsReq extends EmacsRex {
    constructor(msgID: number, threadID: number, frameID: string, pkg?: string) {
        super(msgID, toWire([new LispID('swank:frame-locals-and-catch-tags'), frameID]), new LispID(pkg ?? 'nil'), threadID)
    }
}

export class DebuggerInfoReq extends EmacsRex {
    constructor(msgID: number, threadID: number, start: number, end: number, pkg?: string) {
        super(msgID, toWire([new LispID('swank:debugger-info-for-emacs'), start, end]), new LispID(pkg ?? 'nil'), threadID)
    }
}

export class DebuggerAbortReq extends EmacsRex {
    constructor(msgID: number, threadID: number, pkg?: string) {
        super(msgID, toWire([new LispID('swank:sldb-abort')]), new LispID(pkg ?? 'nil'), threadID)
    }
}

export class DebugThreadReq extends EmacsRex {
    constructor(msgID: number, threadNdx: number, pid: number, pkg?: string) {
        // super(toWire([new LispID('swank:debug-nth-thread'), threadID]), 'COMMON-LISP-USER', true);
        super(
            msgID,
            toWire([new LispID('swank:start-swank-server-in-thread'), threadNdx, `/tmp/slime.${pid}`]),
            new LispID(pkg ?? 'nil'),
            true
        )
    }
}
