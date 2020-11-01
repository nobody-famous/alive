import { SwankConn } from '../../src/swank/SwankConn'
import { expect } from '../Utils'
import { DebugActivate } from '../../src/swank/event/DebugActivate'

async function testConnInfo(conn: SwankConn) {
    const resp = await conn.connectionInfo()

    expect(true, resp.info.pid !== undefined)
}

async function testEval(conn: SwankConn) {
    const resp = await conn.eval('(+ 1 2)')

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
        await testEval(conn)
    } catch (err) {
        console.log('FAILED', err)
    } finally {
        conn.close()
    }
})()
