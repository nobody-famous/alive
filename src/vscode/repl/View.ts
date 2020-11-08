export interface View {
    open(): void
    close(): void
    addLine(line: string): void
    setPrompt(prompt: string): void
}
