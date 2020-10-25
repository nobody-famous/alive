import { SwankEvent } from './SwankEvent'

export class DebugActivateEvent implements SwankEvent {
    op: string
    threadID: number
    level: number
    select: string

    constructor(data: string[]) {
        this.op = data[0]
        this.threadID = parseInt(data[1])
        this.level = parseInt(data[2])
        this.select = data[3]
    }
}
