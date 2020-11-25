import { Return } from '../event'

export class Restart {
    static parse(event: Return): Restart | undefined {
        return new Restart()
    }
}
