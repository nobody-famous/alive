import { getLatestVersion } from '../LspUtils'

const axiosMock = jest.requireMock('axios')
jest.mock('axios')

describe('LspUtils tests', () => {
    describe('getLatestVersion', () => {
        it('Sort versions', async () => {
            axiosMock.mockReturnValueOnce({
                data: [
                    {
                        created_at: '1/1/2000',
                        name: 'first',
                        tag_name: 'first',
                        zipball_url: 'zip_url',
                    },
                    {
                        created_at: '1/1/2010',
                        name: 'second',
                        tag_name: 'second',
                        zipball_url: 'zip_url',
                    },
                ],
            })
            expect(await getLatestVersion('/some/url')).toMatchObject({
                createdAt: Date.parse('1/1/2010'),
                name: 'second',
                tagName: 'second',
                zipballUrl: 'zip_url',
            })
        })

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
