export interface View {
    open(): void
    close(): void
    show(): void
    colorize(): void
    addText(line: string): void
    setPrompt(prompt: string): void
}
