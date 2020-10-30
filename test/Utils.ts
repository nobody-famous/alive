import { format } from 'util'

export function expect(exp: unknown, actual: unknown) {
    if (exp !== actual) {
        throw new Error(`Expected ${format(exp)} found ${actual}`)
    }
}
