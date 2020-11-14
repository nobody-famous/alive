import { SwankConn } from '../../src/swank/SwankConn'
import { expect } from '../Utils'
import { DebugActivate } from '../../src/swank/event/DebugActivate'

async function testConnInfo(conn: SwankConn) {
    const resp = await conn.connectionInfo()

    expect(true, resp.info.pid !== undefined)
}

async function testPackage(conn: SwankConn) {
    await conn.eval('(defpackage :morse (:use :cl))')
    await conn.setPackage(':morse')
}

async function testListPkgs(conn: SwankConn) {
    const resp = await conn.listPackages()
    console.log(resp)
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
        await testListPkgs(conn)
    } catch (err) {
        console.log('FAILED', err)
    } finally {
        conn.close()
    }
})()
