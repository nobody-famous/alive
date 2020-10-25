export class LispSymbol {
    id: string

    constructor(id: string) {
        this.id = id
    }
}

export class LispID {
    id: string

    constructor(id: string) {
        this.id = id
    }
}

export class LispQuote {
    form: string

    constructor(form: string) {
        this.form = form
    }
}
