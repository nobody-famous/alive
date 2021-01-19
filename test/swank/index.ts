import * as path from 'path'
import { Debug } from '../../src/swank/event'
import { DebugActivate } from '../../src/swank/event/DebugActivate'
import { ConnectionInfo } from '../../src/swank/response'
import { SwankConn } from '../../src/swank/SwankConn'
import { expect, expectFail } from '../Utils'

async function testConnInfo(conn: SwankConn) {
    const resp = await conn.connectionInfo()

    expect(true, resp instanceof ConnectionInfo && resp.info.pid !== undefined)

    try {
        await conn.eval(`(remove-if-not #ʄplusp '(1 3 -9 5 -2 -7 6))`)
    } catch (err) {
        console.log(err)
    }
}

async function testPackage(conn: SwankConn) {
    await conn.eval('(defpackage :morse (:use :cl))')
    await conn.setPackage(':morse')
}

async function testListPkgs(conn: SwankConn) {
    const resp = await conn.listPackages()
    console.log(resp)
}

async function testCompileFile() {
    const conn = new SwankConn('localhost', 4005)

    try {
        await conn.connect()

        conn.trace = true
        const resp = await conn.compileFile('hello.lisp')
        console.log(resp)
    } finally {
        conn.close()
    }
}

async function testLoadFile() {
    const conn = new SwankConn('localhost', 4005)

    try {
        await conn.connect()

        conn.trace = true

        const resp = await conn.loadFile('/home/rich/cl/demo/math.lisp')
        console.log(resp)
    } finally {
        conn.close()
    }
}

async function testFindDefs() {
    const conn = new SwankConn('localhost', 4005)

    try {
        await conn.connect()

        conn.trace = true

        await conn.loadFile('/home/rich/cl/demo/math.lisp')

        const resp = await conn.findDefs('add', ':math/test')

        console.log(resp)
    } finally {
        conn.close()
    }
}

async function testMacros() {
    const conn = new SwankConn('localhost', 4005)

    try {
        await conn.connect()

        conn.trace = true

        conn.setIgnoreDebug(true)
        const resp = await conn.evalAndGrab('(ignore-errors #+(s) t)')
        // const resp = await conn.disassemble('\'set-player-1', ':engine')

        console.log(resp)
    } catch (err) {
        console.log('CAUGHT:', err)
    } finally {
        conn.close()
    }
}

async function testInspector() {
    const conn = new SwankConn('localhost', 4005)

    try {
        await conn.connect()
        await conn.connectionInfo()

        conn.trace = true
        const info = await conn.inspector("'foo")
        const resp = await conn.inspectNthPart(1)

        console.log('info', resp)
    } finally {
        conn.close()
    }
}

async function testDebug() {
    const conn = new SwankConn('localhost', 4005)
    let debugEvent: Debug | undefined = undefined
    let activateEvent: DebugActivate | undefined = undefined

    try {
        conn.on('debug', (event) => (debugEvent = event))
        conn.on('activate', (event) => (activateEvent = event))

        await conn.connect()
        await conn.connectionInfo()

        conn.trace = true
        conn.timeout = 50
        await expectFail(() => conn.eval('(+ 1 2 3)'))

        conn.trace = true
        // await conn.listThreads()
        // await conn.debugAbort(debugEvent!.threadID)
        // setTimeout(() => console.log('DONE'), 2000)
    } finally {
        conn.close()
    }
}

async function testRestarts() {
    const funExpr = `(defun divide (x y)
                        (assert (not (zerop y))
                                (y)
                                "Y cannot be zero")
                        (/ x y))

                        (divide 3 0)
                        `
    const evalExpr = `(divide 3 0)`

    const conn = new SwankConn('localhost', 4005)
    let debugEvent: Debug | undefined = undefined
    let activateEvent: DebugActivate | undefined = undefined

    try {
        conn.on('debug', (event) => (debugEvent = event))
        conn.on('activate', async (event) => {
            if (debugEvent === undefined) {
                console.log('debugEvent is undefined')
                return
            }
            await conn.nthRestart(debugEvent.threadID, 1, 0)
        })

        await conn.connect()
        await conn.connectionInfo()

        conn.trace = true
        await conn.eval(funExpr)
        await conn.eval(evalExpr)
    } finally {
        console.log('close connection')
        conn.close()
    }
}

async function testFrame() {
    const funExpr = `(defun divide (x y)
                        (restart-case (/ x y)
                            (return-zero () 0)))`
    const evalExpr = `(divide 3 0)`

    const conn = new SwankConn('localhost', 4005)
    let debugEvent: Debug | undefined = undefined

    try {
        conn.on('debug', (event) => (debugEvent = event))
        conn.on('activate', async (event) => {
            if (debugEvent === undefined) {
                console.log('debugEvent is undefined')
                return
            }

            try {
                const pkg = await conn.framePackage(debugEvent.threadID, 1)
                await conn.evalInFrame(debugEvent.threadID, '(setf y 5)', 1, pkg.name)
                const resp = await conn.frameRestart(debugEvent.threadID, 1)
                console.log('after restart', resp)
            } catch (err) {
                console.log(err)
            }
        })

        await conn.connect()
        await conn.connectionInfo()

        // conn.trace = true
        await conn.eval(funExpr)
        const resp = await conn.eval(evalExpr)
        console.log('after eval', resp)
    } finally {
        console.log('close connection')
        conn.close()
    }
}

async function testRepl(conn: SwankConn) {
    await conn.swankRequire()
    await conn.replCreate()

    conn.on('read-string', (event) => {
        // conn.returnString('foo\n', event.threadID, event.tag)
        conn.interrupt(event.threadID)
    })

    conn.on('write-string', (event) => {
        console.log('write', event.text)
    })

    let debugEvent: Debug | undefined = undefined
    let debugCount: number = 0

    conn.on('debug', (event) => (debugEvent = event))
    conn.on('activate', async (event) => {
        if (debugCount === 0) {
            await conn.nthRestart(event.threadID, 1, 1)
        }
        debugCount += 1
    })

    conn.trace = true

    const resp = await conn.replEval('(read)', 'common-lisp-user')
    console.log(resp)

    conn.trace = false
}

// Wrap in an IIFE so await works
;(async () => {
    const conn = new SwankConn('localhost', 4005)

    conn.on('conn-err', (...args: unknown[]) => console.log('Caught error', ...args))
    conn.on('debug', (event) => console.log('debug thread', event.threadID))
    conn.on('activate', (event: DebugActivate) => console.log(event))

    try {
        await conn.connect()

        // await testConnInfo(conn)
        // await testPackage(conn)
        // await testListPkgs(conn)
        // await testDebug()
        // await testRestarts()
        // await testCompileFile()
        // await testFrame()
        // await testLoadFile()
        // await testFindDefs()
        // await testMacros()
        // await testInspector()
        await testRepl(conn)
    } catch (err) {
        console.log('FAILED', err)
    } finally {
        conn.close()
    }
})()
