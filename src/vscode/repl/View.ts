export interface View {
    open(): void
    close(): void
    show(): void
    addText(line: string): void
    setPrompt(prompt: string): void
}
