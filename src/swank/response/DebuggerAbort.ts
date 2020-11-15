import { Return } from '../event'

export class DebuggerAbort {
    static parse(event: Return): DebuggerAbort | undefined {
        if (event.info.status !== ':ABORT') {
            return undefined
        }

        return new DebuggerAbort()
    }
}
