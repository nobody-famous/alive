import { valueToArray, valueToMap, valueToNumber, valueToString } from '../../lisp'
import { ConnInfo, Encoding, StringMap, PkgInfo } from '../Types'
import { isObject, isString } from 'util'

export class ConnectionInfo {
    info: ConnInfo

    constructor(info: StringMap) {
        this.info = {}

        this.info.pid = valueToNumber(info.pid)

        if (info.encoding !== undefined) {
            this.info.encoding = info.encoding as Encoding
        }

        this.info.impl = valueToMap(info.lisp_implementation)
        this.info.machine = valueToMap(info.machine)
        this.info.package = this.valueToPkgInfo(info.package)

        this.info.style = valueToString(info.style)
        this.info.features = valueToArray(info.features)
        this.info.modules = valueToArray(info.modules)
        this.info.version = valueToString(info.version)
    }

    valueToPkgInfo(info: unknown): PkgInfo | undefined {
        if (!isObject(info)) {
            return undefined
        }

        const obj = info as StringMap
        if (!isString(obj.name) || !isString(obj.prompt)) {
            throw new Error(`Invalid package info: name ${obj.name}, prompt ${obj.prompt}`)
        }

        return {
            name: obj.name,
            prompt: obj.prompt,
        }
    }
}
