import { format } from 'util'
import { Lexer, Parser, InPackage, findAtom } from '../../src/lisp'
import { expect } from '../Utils'

function parser() {
    const lex = new Lexer('(in-package s)')
    const parser = new Parser(lex.getTokens())
    const exprs = parser.parse()
    const atom = findAtom(exprs, { line: 0, character: 13 })

    expect('S', atom?.value)
}

function parseEmpty() {
    const lex = new Lexer('()')
    const parser = new Parser(lex.getTokens())
    const exprs = parser.parse()

    console.log(exprs)
}

function runAllTests() {
    // parser()
    parseEmpty()
}

try {
    runAllTests()
} catch (err) {
    console.log(`FAILED ${format(err)}`)
}
