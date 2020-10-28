import { valueToArray, valueToMap, valueToNumber, valueToString, Expr } from '../../lisp'
import { ConnInfo, Encoding, StringMap, PkgInfo } from '../Types'
import { isObject, isString } from 'util'
import { plistToObj } from '../SwankUtils'

export class ConnectionInfo {
    info: ConnInfo

    constructor(info: ConnInfo) {
        this.info = info
    }

    static parse(data: unknown): ConnectionInfo | undefined {
        if (!Array.isArray(data)) {
            return undefined
        }

        const exprList = data as Expr[]
        const plist = plistToObj(exprList)

        if (!isObject(plist)) {
            return undefined
        }

        const info = plist as ConnInfo
        const connInfo: ConnInfo = {}

        connInfo.pid = valueToNumber(info.pid)

        if (info.encoding !== undefined) {
            connInfo.encoding = info.encoding as Encoding
        }

        connInfo.impl = valueToMap(info.lisp_implementation)
        connInfo.machine = valueToMap(info.machine)
        connInfo.package = this.valueToPkgInfo(info.package)

        connInfo.style = valueToString(info.style)
        connInfo.features = valueToArray(info.features)
        connInfo.modules = valueToArray(info.modules)
        connInfo.version = valueToString(info.version)

        return new ConnectionInfo(connInfo)
    }

    static valueToPkgInfo(info: unknown): PkgInfo | undefined {
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
