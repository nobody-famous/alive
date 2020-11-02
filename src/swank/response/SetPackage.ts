import { Return } from '../event'
import { SExpr, exprToString } from '../../lisp'

export class SetPackage {
    name: string
    prompt: string

    constructor(name: string, prompt: string) {
        this.name = name
        this.prompt = prompt
    }

    static parse(event: Return): SetPackage | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const payload = event.info.payload

        if (!(payload instanceof SExpr) || payload.parts.length < 2) {
            return undefined
        }

        const pkgName = exprToString(payload.parts[0])
        const prompt = exprToString(payload.parts[1])

        if (pkgName === undefined || prompt === undefined) {
            return undefined
        }

        return new SetPackage(pkgName, prompt)
    }
}
