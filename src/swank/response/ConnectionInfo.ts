import { Expr, exprToNumber, exprToString, exprToStringArray, isString, SExpr } from '../../lisp'
import { Return } from '../event/Return'
import { plistToObj } from '../SwankUtils'
import { ConnInfo, PkgInfo } from '../Types'

export class ConnectionInfo {
    info: ConnInfo

    constructor(info: ConnInfo) {
        this.info = info
    }

    static parse(event: Return): ConnectionInfo | undefined {
        if (event.info.status !== ':OK') {
            return undefined
        }

        const infoExpr = event.info.payload

        if (!(infoExpr instanceof SExpr)) {
            throw new Error('ConnectionInfo Invalid payload')
        }
        const connInfo: ConnInfo = {}

        for (let ndx = 0; ndx < infoExpr.parts.length; ndx += 1) {
            const name = exprToString(infoExpr.parts[ndx])
            if (name === undefined) {
                break
            }

            const valueExpr = infoExpr.parts[ndx + 1]

            if (name === ':PID') {
                connInfo.pid = exprToNumber(valueExpr)
            } else if (name === ':FEATURES') {
                connInfo.features = exprToStringArray(valueExpr)
            } else if (name === ':PACKAGE') {
                connInfo.package = this.exprToPkgInfo(valueExpr)
            } else if (name === ':VERSION') {
                connInfo.version = exprToString(valueExpr)
            }

            ndx += 1
        }

        return new ConnectionInfo(connInfo)
    }

    private static exprToPkgInfo(expr: Expr): PkgInfo | undefined {
        if (!(expr instanceof SExpr)) {
            return undefined
        }

        const plist = plistToObj(expr.parts)

        if (plist === undefined || !isString(plist.name) || !isString(plist.prompt)) {
            return undefined
        }

        return {
            name: plist.name as string,
            prompt: plist.prompt as string,
        }

        // if (!isObject(info)) {
        //     return undefined
        // }

        // const obj = info as StringMap
        // if (!isString(obj.name) || !isString(obj.prompt)) {
        //     throw new Error(`Invalid package info: name ${obj.name}, prompt ${obj.prompt}`)
        // }

        // return {
        //     name: obj.name as string,
        //     prompt: obj.prompt as string,
        // }
    }
}
