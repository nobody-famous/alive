import { Position, Range } from 'vscode'
import * as types from '../Types'
import { Node } from './Node'

export class AST {
    nodes: Node[]

    constructor() {
        this.nodes = []
    }

    addNode(node: Node) {
        this.nodes.push(node)
    }

    getPositionNode(pos: Position) {
        for (let node of this.nodes) {
            const range = this.getNodeRange(node)

            if (range !== undefined && this.isPosInRange(pos, range)) {
                return node
            }
        }

        return undefined
    }

    getNodeRange(node: Node): Range | undefined {
        if (node.value !== undefined && node.value.type === types.WHITE_SPACE) {
            return undefined
        }

        if (node.open !== undefined && node.close !== undefined) {
            return new Range(node.open.start, node.close.end)
        }

        if (node.value !== undefined) {
            return new Range(node.value.start, node.value.end)
        }

        return undefined
    }

    isPosInRange(pos: Position, range: Range): boolean {
        if (range === undefined) {
            return false
        }

        if (pos.line === range.start.line) {
            return pos.character >= range.start.character
        }

        if (pos.line === range.end.line) {
            return pos.character <= range.end.character
        }

        return pos.line >= range.start.line && pos.line <= range.end.line
    }

    debug() {
        for (let ndx = 0; ndx < this.nodes.length; ndx += 1) {
            const node = this.nodes[ndx]
            this.debugNode(node, '  ')
        }
    }

    debugNode(node: Node, indent: string) {
        if (node.value !== undefined) {
            const str = node.value.type === types.WHITE_SPACE ? '' : node.value.text
            console.log(`${indent}${str}`)
            return
        }

        console.log(`${indent}(`)
        for (let ndx = 0; ndx < node.kids.length; ndx += 1) {
            const kid = node.kids[ndx]
            this.debugNode(kid, indent + '  ')
        }
        console.log(`${indent})`)
    }
}
