import { FormatToken } from './FormatToken'

export class TokenList {
    tokens: FormatToken[] = []
    ndx: number = 0

    isEmpty(): boolean {
        return this.tokens.length === 0
    }

    add(token: FormatToken) {
        this.tokens.push(token)
    }

    peek(): FormatToken | undefined {
        return this.tokens[this.ndx]
    }

    prev(): FormatToken | undefined {
        return this.tokens[this.ndx - 1]
    }

    consume(): FormatToken | undefined {
        this.ndx += 1

        return this.peek()
    }
}
