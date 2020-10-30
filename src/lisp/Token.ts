import { Position } from "./Types";

export class Token {
    type: number;
    start: Position;
    end: Position;
    text: string;

    constructor(type: number, start: Position, end: Position, text: string) {
        this.type = type;
        this.start = start;
        this.end = end;
        this.text = text;
    }
}
