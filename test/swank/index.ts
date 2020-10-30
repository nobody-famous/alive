import { SwankConn } from '../../src/swank/SwankConn'

async function testConnInfo(conn: SwankConn) {
    const resp = await conn.connectionInfo()
    console.log(resp.info)
}

// Wrap in an IIFE so await works
;(async () => {
    const conn = new SwankConn('localhost', 4005)

    conn.on('conn-err', (...args: unknown[]) => console.log(...args))

    try {
        await conn.connect()

        await testConnInfo(conn)
    } catch (err) {
        console.log('HERE', err)
    } finally {
        conn.close()
    }
})()
