import * as vscode from 'vscode'
import { Token } from '../../lisp/Token'
import * as types from '../../lisp/Types'
import { Repl } from '../repl'
import { toVscodePos } from '../Utils'
import { SemanticAnalyzer } from './SemanticAnalyzer'

type stylesDict = { [index: number]: string }

const typeStyles: stylesDict = {}
typeStyles[types.OPEN_PARENS] = 'parenthesis'
typeStyles[types.CLOSE_PARENS] = 'parenthesis'
typeStyles[types.KEYWORD] = 'keyword'
typeStyles[types.COMMENT] = 'comment'
typeStyles[types.CONTROL] = 'function'
typeStyles[types.MACRO] = 'keyword'
typeStyles[types.DEFUN] = 'keyword'
typeStyles[types.DEFINE_CONDITION] = 'keyword'
typeStyles[types.DEFCLASS] = 'keyword'
typeStyles[types.DEFMACRO] = 'keyword'
typeStyles[types.DEFMETHOD] = 'keyword'
typeStyles[types.LOOP] = 'keyword'
typeStyles[types.SPECIAL] = 'keyword'
typeStyles[types.ID] = 'variable'
typeStyles[types.FUNCTION] = 'function'
typeStyles[types.STRING] = 'string'
typeStyles[types.QUOTED] = 'string'
typeStyles[types.SINGLE_QUOTE] = 'string'
typeStyles[types.BACK_QUOTE] = 'string'
typeStyles[types.PACKAGE_NAME] = 'namespace'
typeStyles[types.SYMBOL] = 'symbol'
typeStyles[types.PARAMETER] = 'parameter'
typeStyles[types.VARIABLE] = 'variable'
typeStyles[types.MISMATCHED_OPEN_PARENS] = 'default'
typeStyles[types.MISMATCHED_CLOSE_PARENS] = 'error'
typeStyles[types.MISMATCHED_DBL_QUOTE] = 'error'
typeStyles[types.MISMATCHED_BAR] = 'error'
typeStyles[types.MISMATCHED_COMMENT] = 'error'
typeStyles[types.ERROR] = 'error'

interface styleMapType {
    [index: string]: vscode.Range[]
}

export const tokenTypesLegend = [
    'comment',
    'string',
    'keyword',
    'number',
    'regexp',
    'operator',
    'namespace',
    'type',
    'struct',
    'class',
    'interface',
    'enum',
    'typeParameter',
    'function',
    'member',
    'macro',
    'variable',
    'parameter',
    'property',
    'label',
    'error',
    'parenthesis',
    'symbol',
]

export const tokenModifiersLegend = [
    'declaration',
    'documentation',
    'readonly',
    'static',
    'abstract',
    'deprecated',
    'modification',
    'async',
]

export class Colorizer {
    repl?: Repl
    typesMap: { [index: string]: number | undefined } = {}
    modsMap: { [index: string]: number | undefined } = {}

    constructor(repl?: Repl) {
        this.repl = repl

        tokenTypesLegend.forEach((type, index) => (this.typesMap[type] = index))
        tokenModifiersLegend.forEach((mod, index) => (this.modsMap[mod] = index))
    }

    async run(tokens: Token[]) {
        const legend = new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend)
        const styleMap = await this.buildStyleMap(tokens)
        const entries = Object.entries(styleMap)
        const builder = new vscode.SemanticTokensBuilder(legend)

        for (const [str, ranges] of entries) {
            for (const range of ranges) {
                if (this.typesMap[str] === undefined) {
                    continue
                }

                const split = this.splitRange(range)

                for (const r of split) {
                    builder.push(r, str)
                }
            }
        }

        return builder.build()
    }

    private splitRange(range: vscode.Range): vscode.Range[] {
        if (range.start.line === range.end.line) {
            return [range]
        }

        const split: vscode.Range[] = []

        split.push(this.buildRange(range.start.line, range.start.character))

        for (let line = range.start.line + 1; line <= range.end.line; line += 1) {
            split.push(this.buildRange(line, 0))
        }

        return split
    }

    private buildRange(line: number, char: number): vscode.Range {
        const start = new vscode.Position(line, char)
        const end = new vscode.Position(line, Number.MAX_SAFE_INTEGER)

        return new vscode.Range(start, end)
    }

    private async buildStyleMap(lexTokens: Token[]): Promise<styleMapType> {
        if (lexTokens.length === 0) {
            return {}
        }

        const analyzer = new SemanticAnalyzer(this.repl, lexTokens)
        await analyzer.analyze()

        const styleMap = {}
        let mismatched = false

        for (const token of lexTokens) {
            let style = typeStyles[token.type] ?? 'default'
            const target = new vscode.Range(toVscodePos(token.start), toVscodePos(token.end))

            if (token.type === types.WHITE_SPACE) {
                continue
            }

            if (!mismatched && token.type === types.SYMBOL) {
                const ndx = token.text.indexOf(':')

                if (ndx >= 0) {
                    const pkgStart = toVscodePos(token.start)
                    const pkgEnd = new vscode.Position(token.end.line, token.start.character + ndx)

                    this.addToMap(styleMap, typeStyles[types.PACKAGE_NAME], new vscode.Range(pkgStart, pkgEnd))

                    const symStart = new vscode.Position(token.start.line, token.start.character + ndx)
                    this.addToMap(styleMap, typeStyles[types.SYMBOL], new vscode.Range(symStart, toVscodePos(token.end)))
                    continue
                }
            }

            if (mismatched) {
                style = 'error'
            }

            if (this.isMismatched(analyzer, token)) {
                mismatched = true
            }

            this.addToMap(styleMap, style, target)
        }

        return styleMap
    }

    private isMismatched(parser: SemanticAnalyzer, token: Token) {
        if (parser.unclosedString !== undefined) {
            return false
        }

        const mismatched = [
            types.MISMATCHED_BAR,
            types.MISMATCHED_CLOSE_PARENS,
            types.MISMATCHED_COMMENT,
            types.MISMATCHED_DBL_QUOTE,
            types.MISMATCHED_OPEN_PARENS,
        ]

        return mismatched.includes(token.type)
    }

    private addToMap(map: styleMapType, key: string, entry: vscode.Range) {
        if (map[key] === undefined) {
            map[key] = []
        }

        map[key].push(entry)
    }
}
