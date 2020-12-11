export interface HistoryItem {
    text: string
    pkgName: string
}

export class History {
    list: HistoryItem[] = []

    add(text: string, pkgName: string) {
        this.remove(text)
        this.list.push({ text, pkgName })
    }

    private remove(text: string) {
        this.list = this.list.filter((item) => item.text !== text)
    }
}
