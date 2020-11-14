import { format } from 'util'
import { Lexer, Parser, InPackage, findAtom } from '../../src/lisp'
import { expect } from '../Utils'

function parser() {
    const lex = new Lexer('(in-package s)')
    const parser = new Parser(lex.getTokens())
    const exprs = parser.parse()
    const atom = findAtom(exprs, { line: 0, character: 13 })

    expect(true, exprs[0] instanceof InPackage)
    expect('S', atom?.value)
}

function runAllTests() {
    parser()
}

try {
    runAllTests()
} catch (err) {
    console.log(`FAILED ${format(err)}`)
}
