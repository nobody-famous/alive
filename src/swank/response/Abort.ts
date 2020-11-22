import { Return } from '../event'

export class Abort {
    static parse(event: Return): Abort | undefined {
        return new Abort()
    }
}
