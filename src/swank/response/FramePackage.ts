import { Atom, exprToString } from '../../lisp'
import { Return } from '../event'

export class FramePackage {
    name: string

    constructor(name: string) {
        this.name = name
    }

    static parse(event: Return): FramePackage | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof Atom)) {
            return undefined
        }

        const name = exprToString(payload)

        return name !== undefined ? new FramePackage(name) : undefined
    }
}
