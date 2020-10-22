import * as types from '../Types';
import * as vscode from 'vscode';
import { Token } from '../Token';
import { Range, window } from 'vscode';
import { Parser } from './Parser';

type decoratonDict = { [index: string]: any };
const decorationTypes: decoratonDict = {
    'common_lisp.default': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.default' },
    }),
    'common_lisp.comment': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.comment' },
    }),
    'common_lisp.id': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.id' },
    }),
    'common_lisp.error': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.error' },
    }),
    'common_lisp.keyword': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.keyword' },
    }),
    'common_lisp.packages': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.packages' },
    }),
    'common_lisp.control': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.control' },
    }),
    'common_lisp.function': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.function' },
    }),
    'common_lisp.macro': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.macro' },
    }),
    'common_lisp.special': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.special' },
    }),
    'common_lisp.string': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.string' },
    }),
    'common_lisp.quoted': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.quoted' },
    }),
    'common_lisp.package': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.package' },
    }),
    'common_lisp.symbol': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.symbol' },
    }),
    'common_lisp.parameter': window.createTextEditorDecorationType({
        color: { id: 'common_lisp.parameter' },
    }),
    'editorWhitespace.foreground': window.createTextEditorDecorationType({
        color: { id: 'editorWhitespace.foreground' },
    }),
};

type stylesDict = { [index: number]: string };

const typeStyles: stylesDict = {};
typeStyles[types.OPEN_PARENS] = 'common_lisp.default';
typeStyles[types.CLOSE_PARENS] = 'common_lisp.default';
typeStyles[types.KEYWORD] = 'common_lisp.keyword';
typeStyles[types.COMMENT] = 'common_lisp.comment';
typeStyles[types.CONTROL] = 'common_lisp.control';
typeStyles[types.MACRO] = 'common_lisp.macro';
typeStyles[types.SPECIAL] = 'common_lisp.special';
typeStyles[types.ID] = 'common_lisp.id';
typeStyles[types.FUNCTION] = 'common_lisp.function';
typeStyles[types.STRING] = 'common_lisp.string';
typeStyles[types.QUOTED] = 'common_lisp.quoted';
typeStyles[types.SINGLE_QUOTE] = 'common_lisp.quoted';
typeStyles[types.BACK_QUOTE] = 'common_lisp.quoted';
typeStyles[types.PACKAGE_NAME] = 'common_lisp.package';
typeStyles[types.SYMBOL] = 'common_lisp.symbol';
typeStyles[types.PARAMETER] = 'common_lisp.parameter';
typeStyles[types.MISMATCHED_OPEN_PARENS] = 'common_lisp.default';
typeStyles[types.MISMATCHED_CLOSE_PARENS] = 'common_lisp.error';
typeStyles[types.MISMATCHED_DBL_QUOTE] = 'common_lisp.error';
typeStyles[types.MISMATCHED_BAR] = 'common_lisp.error';
typeStyles[types.MISMATCHED_COMMENT] = 'common_lisp.error';

interface rangeValue {
    range: Range;
}

interface styleMapType {
    [index: string]: rangeValue[];
}

export class Colorizer {
    constructor() {}

    run(editor: vscode.TextEditor, tokens: Token[]) {
        if (tokens === undefined || tokens.length === 0) {
            return;
        }

        const styleMap = this.buildStyleMap(editor, tokens);
        const entries = Object.entries(styleMap);

        this.clearEmptyTypes(editor, styleMap);

        for (let ndx = 0; ndx < entries.length; ndx += 1) {
            const [style, list] = entries[ndx];
            const decoration = decorationTypes[style];

            if (decoration === undefined) {
                continue;
            }

            editor.setDecorations(decoration, list);
        }
    }

    clearEmptyTypes(editor: vscode.TextEditor, styleMap: styleMapType) {
        const styles = Object.keys(decorationTypes);

        for (let ndx = 0; ndx < styles.length; ndx += 1) {
            const style = styles[ndx];

            if (styleMap[style] === undefined) {
                editor.setDecorations(decorationTypes[style], []);
            }
        }
    }

    buildStyleMap(editor: vscode.TextEditor, lexTokens: Token[]): styleMapType {
        const parser = new Parser(editor.document.getText(), lexTokens);
        const map = {};

        const tokens = parser.parse();
        let mismatched = false;
        for (const token of tokens) {
            let style = typeStyles[token.type] || 'common_lisp.default';
            const target = { range: new Range(token.start, token.end) };

            if (token.type === types.WHITE_SPACE) {
                continue;
            }

            if (mismatched) {
                style = 'common_lisp.error';
            }

            if (this.isMismatched(parser, token)) {
                mismatched = true;
            }

            this.addToMap(map, style, target);
        }

        return map;
    }

    isMismatched(parser: Parser, token: Token) {
        if (parser.unclosedString !== undefined) {
            return false;
        }

        if (token.type === types.MISMATCHED_OPEN_PARENS || token.type === types.MISMATCHED_CLOSE_PARENS) {
            return true;
        }
    }

    addToMap(map: styleMapType, key: string, entry: rangeValue) {
        if (map[key] === undefined) {
            map[key] = [];
        }

        map[key].push(entry);
    }
}
