import { LispID, LispQuote, LispSymbol } from './LispID'
import { toWire } from './SwankUtils'

type emacsRexThread = number | boolean | LispSymbol

class SwankMessage {
    data: string[]

    constructor(data: string[]) {
        this.data = data
    }

    encode() {
        const str = Buffer.from(`(${this.data.join(' ')})`, 'utf-8')
        const len = str.length.toString(16).padStart(6, '0')

        return `${len}${str}`
    }
}

export class SwankRequest extends SwankMessage {
    msgID: number

    constructor(msgID: number, data: string[]) {
        super(data)
        this.msgID = msgID
    }

    encode() {
        this.data.push(toWire(this.msgID))

        return super.encode()
    }
}

export function emacsRex(msgID: number, data: string, pkg: any, threadID: emacsRexThread) {
    const rexData = [toWire(new LispSymbol('emacs-rex')), data, toWire(pkg), toWire(threadID)]
    return new SwankRequest(msgID, rexData)
}

export function setPackageReq(msgID: number, pkg?: string) {
    const data = [new LispID('swank:set-package'), new LispID(pkg ?? '')]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function listPackagesReq(msgID: number, pkg?: string) {
    const data = [new LispID('swank:list-all-package-names'), true, new LispID(pkg ?? '')]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function docSymbolReq(msgID: number, symbol: string, pkg?: string) {
    const data = [new LispID('swank:documentation-symbol'), symbol]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function completionsReq(msgID: number, prefix: string, pkg: string) {
    const data = [new LispID('swank:simple-completions'), prefix, pkg]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function opArgsReq(msgID: number, name: string, pkg: string) {
    const data = [new LispID('swank:operator-arglist'), name, pkg]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function swankRequireReq(msgID: number, pkg?: string) {
    const data = [new LispID('swank:swank-require (quote (swank-repl))')]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function connectionInfoReq(msgID: number, pkg?: string) {
    const data = [new LispID('swank:connection-info')]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function macroExpandReq(msgID: number, form: string, pkg?: string) {
    const data = [new LispID('swank:swank-macroexpand-1'), form]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function macroExpandAllReq(msgID: number, form: string, pkg?: string) {
    const data = [new LispID('swank:swank-macroexpand-all'), form]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function disassembleReq(msgID: number, form: string, pkg?: string) {
    const data = [new LispID('swank:disassemble-form'), form]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function inspectorReq(msgID: number, form: string, pkg?: string) {
    const data = [new LispID('swank:init-inspector'), form]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function inspectNthPartReq(msgID: number, index: number, pkg?: string) {
    const data = [new LispID('swank:inspect-nth-part'), index]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function inspectNthActionReq(msgID: number, index: number, pkg?: string) {
    const data = [new LispID('swank:inspector-call-nth-action'), index]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function inspectorPrevReq(msgID: number) {
    const data = [new LispID('swank:inspector-pop')]
    return emacsRex(msgID, toWire(data), new LispID('nil'), true)
}

export function inspectorNextReq(msgID: number) {
    const data = [new LispID('swank:inspector-next')]
    return emacsRex(msgID, toWire(data), new LispID('nil'), true)
}

export function inspectorRefreshReq(msgID: number) {
    const data = [new LispID('swank:inspector-reinspect')]
    return emacsRex(msgID, toWire(data), new LispID('nil'), true)
}

export function inspectorQuitReq(msgID: number) {
    const data = [new LispID('swank:quit-inspector')]
    return emacsRex(msgID, toWire(data), new LispID('nil'), true)
}

export function evalReq(msgID: number, form: string, pkg?: string) {
    const data = [new LispID('swank:interactive-eval'), form]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function evalAndGrabReq(msgID: number, form: string, pkg?: string) {
    const data = [new LispID('swank:eval-and-grab-output'), form]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function compileFileReq(msgID: number, fileName: string, path: string, pkg?: string) {
    const data = [new LispID('swank:compile-file-for-emacs'), fileName, false, new LispID(':fasl-directory'), path]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function loadFileReq(msgID: number, fileName: string, pkg?: string) {
    const data = [new LispID('swank:load-file'), fileName]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function findDefsReq(msgID: number, str: string, pkg?: string) {
    const data = [new LispID('swank:find-definitions-for-emacs'), str]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function threadsReq(msgID: number, pkg?: string) {
    const data = [new LispID('swank:list-threads')]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function nthRestartReq(msgID: number, threadID: number, level: number, restart: number, pkg?: string) {
    const data = [new LispID('swank:invoke-nth-restart-for-emacs'), level, restart]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), threadID)
}

export function frameLocalsReq(msgID: number, threadID: number, frameID: string, pkg?: string) {
    const data = [new LispID('swank:frame-locals-and-catch-tags'), frameID]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), threadID)
}

export function frameEvalReq(msgID: number, threadID: number, text: string, frameID: string, pkg: string) {
    const data = [new LispID('swank:eval-string-in-frame'), text, frameID, pkg]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), threadID)
}

export function framePackageReq(msgID: number, threadID: number, frameID: string, pkg?: string) {
    const data = [new LispID('swank:frame-package-name'), frameID]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), threadID)
}

export function frameRestartReq(msgID: number, threadID: number, frameID: string, pkg?: string) {
    const data = [new LispID('swank:restart-frame'), frameID]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), threadID)
}

export function debuggerInfoReq(msgID: number, threadID: number, start: number, end: number, pkg?: string) {
    const data = [new LispID('swank:debugger-info-for-emacs'), start, end]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), threadID)
}

export function debuggerAbortReq(msgID: number, threadID: number, pkg?: string) {
    const data = [new LispID('swank:sldb-abort')]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), threadID)
}

export function debugThreadReq(msgID: number, threadNdx: number, pid: number, pkg?: string) {
    const data = [new LispID('swank:start-swank-server-in-thread'), threadNdx, `/tmp/slime.${pid}`]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

//
// REPL Commands
//

export function replEvalReq(msgID: number, form: string, pkg?: string) {
    const data = [new LispID('swank-repl:listener-eval'), form]
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), new LispSymbol('repl-thread'))
}

export function replCreateReq(msgID: number, pkg?: string) {
    const data = [new LispID('swank-repl:create-repl'), false, new LispSymbol('coding-system'), 'utf-8-unix']
    return emacsRex(msgID, toWire(data), new LispID(pkg ?? 'nil'), true)
}

export function returnStringEvent(text: string, threadID: number, tag: number) {
    const rexData = [toWire(new LispSymbol('emacs-return-string')), toWire(threadID), toWire(tag), toWire(text)]
    return new SwankMessage(rexData)
}

export function abortReadEvent(threadID: number, tag: number) {
    const rexData = [toWire(new LispSymbol('emacs-abort-read')), toWire(threadID), toWire(tag)]
    return new SwankMessage(rexData)
}

export function pongEvent(threadID: number, tag: number) {
    const rexData = [toWire(new LispSymbol('emacs-pong')), toWire(threadID), toWire(tag)]
    return new SwankMessage(rexData)
}

export function interruptEvent(threadID: number) {
    const rexData = [toWire(new LispSymbol('emacs-interrupt')), toWire(threadID)]
    return new SwankMessage(rexData)
}
