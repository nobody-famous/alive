import { convertArray } from '../SwankUtils'

export class Eval {
    result: string

    constructor(data: any[]) {
        let count = 0

        for (let ndx = 0; ndx < data.length; ndx += 1) {
            if (data[ndx] === '""') {
                count += 1
            }
        }

        data.splice(0, count)
        this.result = convertArray(data).join('\n')
    }
}
