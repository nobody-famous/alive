export interface View {
    open(): void
    close(): void
    show(): void
    documentChanged(): void
    addText(line: string): void
    setPrompt(prompt: string): void
}
