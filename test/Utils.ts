import { format } from 'util'

export function expect(exp: unknown, actual: unknown) {
    if (exp !== actual) {
        throw new Error(`Expected ${format(exp)} found ${actual}`)
    }
}

export async function expectFail(fn: () => Promise<any>) {
    try {
        await fn()
        throw new Error('Expected to fail')
    } catch (err) {
        // Expected
    }
}
