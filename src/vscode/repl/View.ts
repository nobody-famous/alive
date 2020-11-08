export interface View {
    open(): void
    close(): void
    addText(line: string): void
    setPrompt(prompt: string): void
}
