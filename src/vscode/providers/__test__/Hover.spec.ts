import { isObject, isString } from '../../Guards'
import { LispSymbol } from '../../Types'
import { getHoverProvider } from '../Hover'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

describe('Hover tests', () => {
    const runTest = async (
        stateHoverText: string,
        lspHoverText: string,
        lspSymbol: LispSymbol | undefined,
        validate: (text: string) => void
    ) => {
        const state = { hoverText: stateHoverText }
        const lsp = { getHoverText: jest.fn(async () => lspHoverText), getSymbol: jest.fn(async () => lspSymbol) }
        const provider = getHoverProvider(state, lsp)

        const hover = await provider.provideHover({ uri: new vscodeMock.Uri() }, new vscodeMock.Position())

        if (isObject(hover.contents[0]) && isString(hover.contents[0].value)) {
            validate(hover.contents[0].value)
        } else {
            throw new Error('Invalid hover result object')
        }
    }

    it('Hover text', async () => {
        await runTest('', '', undefined, (text) => expect(text).toBe(''))
        await runTest('', 'foo', undefined, (text) => expect(text).toBe('foo'))
        await runTest('foo', '', undefined, (text) => expect(text).toBe('foo'))
    })

    it('Symbol', async () => {
        await runTest('', 'foo', { name: 'bar', package: 'package' }, (text) => {
            expect(text.startsWith('foo')).toBe(true)
        })
    })
})
