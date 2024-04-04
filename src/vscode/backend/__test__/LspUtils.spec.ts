import { getLatestVersion } from '../LspUtils'

const axiosMock = jest.requireMock('axios')
jest.mock('axios')

describe('LspUtils tests', () => {
    describe('getLatestVersion', () => {
        it('Invalid data', async () => {
            axiosMock.mockReturnValueOnce({ data: [{ foo: 'bar', baz: 'abc' }] })
            expect(await getLatestVersion('/some/url')).toBeUndefined()
        })

        it('Empty array', async () => {
            axiosMock.mockReturnValueOnce({ data: [] })
            expect(await getLatestVersion('/some/url')).toBeUndefined()
        })

        it('Not an array', async () => {
            axiosMock.mockReturnValueOnce(undefined)
            expect(await getLatestVersion('/some/url')).toBeUndefined()
        })
    })
})
