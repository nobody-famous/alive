import { Debug } from '../../src/swank/event'
import { DebugActivate } from '../../src/swank/event/DebugActivate'
import { ConnectionInfo } from '../../src/swank/response'
import { SwankConn } from '../../src/swank/SwankConn'
import { expect, expectFail } from '../Utils'

async function testConnInfo(conn: SwankConn) {
    const resp = await conn.connectionInfo()

    expect(true, resp instanceof ConnectionInfo && resp.info.pid !== undefined)
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
            await conn.nthRestart(debugEvent.threadID, 0)
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

// Wrap in an IIFE so await works
;(async () => {
    const conn = new SwankConn('localhost', 4005)

    conn.on('conn-err', (...args: unknown[]) => console.log('Caught error', ...args))
    conn.on('debug', (event) => console.log('debug', event))
    conn.on('activate', (event: DebugActivate) => console.log(event))

    try {
        await conn.connect()

        // await testConnInfo(conn)
        // await testPackage(conn)
        // await testListPkgs(conn)
        // await testDebug()
        await testRestarts()
        // await testCompileFile()
    } catch (err) {
        console.log('FAILED', err)
    } finally {
        conn.close()
    }
})()
