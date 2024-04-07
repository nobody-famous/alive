import * as path from 'path'
import { createPath, doesPathExist, getInstalledVersion, getLatestVersion, pullLatestVersion } from '../LspUtils'
import { GitHubVersion } from '../../Types'

const axiosMock = jest.requireMock('axios')
jest.mock('axios')

const fsMock = jest.requireMock('fs')
jest.mock('fs')

const zipMock = jest.requireMock('../ZipUtils')
jest.mock('../ZipUtils')

describe('LspUtils tests', () => {
    describe('getLatestVersion', () => {
        it('Sort versions', async () => {
            const createFakeData = (dates: string[]) => {
                const data: GitHubVersion[] = []

                dates.forEach((date, index) =>
                    data.push({
                        created_at: date,
                        name: `name ${index}`,
                        tag_name: `tag_name ${index}`,
                        zipball_url: `zipball_url ${index}`,
                    })
                )

                return data
            }

            axiosMock.mockReturnValueOnce({ data: createFakeData(['1/1/2000', '1/1/2010']) })
            expect(await getLatestVersion('/some/url')).toMatchObject({
                createdAt: Date.parse('1/1/2010'),
                name: 'name 1',
                tagName: 'tag_name 1',
                zipballUrl: 'zipball_url 1',
            })

            axiosMock.mockReturnValueOnce({ data: createFakeData(['1/1/2010', '1/1/2000']) })
            expect(await getLatestVersion('/some/url')).toMatchObject({
                createdAt: Date.parse('1/1/2010'),
                name: 'name 0',
                tagName: 'tag_name 0',
                zipballUrl: 'zipball_url 0',
            })

            axiosMock.mockReturnValueOnce({ data: createFakeData(['1/1/2010', '1/1/2010']) })
            expect(await getLatestVersion('/some/url')).toMatchObject({
                createdAt: Date.parse('1/1/2010'),
                name: 'name 0',
                tagName: 'tag_name 0',
                zipballUrl: 'zipball_url 0',
            })

            axiosMock.mockReturnValueOnce({ data: createFakeData(['Invalid date']) })
            expect(await getLatestVersion('/some/url')).toMatchObject({
                createdAt: 0,
                name: 'name 0',
                tagName: 'tag_name 0',
                zipballUrl: 'zipball_url 0',
            })

            axiosMock.mockReturnValueOnce({ data: createFakeData(['Invalid date', 'Invalid date']) })
            expect(await getLatestVersion('/some/url')).toMatchObject({
                createdAt: 0,
                name: 'name 0',
                tagName: 'tag_name 0',
                zipballUrl: 'zipball_url 0',
            })
        })

        it('Invalid data', async () => {
            axiosMock.mockReturnValueOnce({ data: [{ foo: 'bar', baz: 'abc' }] })
            expect(await getLatestVersion('/some/url')).toBeUndefined()

            axiosMock.mockReturnValueOnce({ data: 10 })
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

    it('createPath', async () => {
        try {
            fsMock.promises = { mkdir: jest.fn() }

            await createPath('/some/path')

            expect(fsMock.promises.mkdir).toHaveBeenCalledWith('/some/path', expect.objectContaining({ recursive: true }))
        } finally {
            fsMock.promises = undefined
        }
    })

    it('doesPathExist', async () => {
        try {
            fsMock.promises = { access: jest.fn() }

            expect(await doesPathExist('/first/path')).toBe(true)

            fsMock.promises.access.mockImplementationOnce(() => {
                throw new Error('Failed, as requested')
            })
            expect(await doesPathExist('/second/path')).toBe(false)
        } finally {
            fsMock.promises = undefined
        }
    })

    describe('getInstalledVersion', () => {
        beforeEach(() => {
            fsMock.promises = {
                readdir: jest.fn(() => []),
                rm: jest.fn(),
            }
        })

        afterEach(() => {
            fsMock.promises = undefined
        })

        it('No files', async () => {
            expect(await getInstalledVersion('/some/path')).toBeUndefined()
            expect(fsMock.promises.rm).not.toHaveBeenCalled()
        })

        it('One file', async () => {
            fsMock.promises.readdir.mockReturnValueOnce(['some_file'])

            expect(await getInstalledVersion('/some/path')).toBe('some_file')
            expect(fsMock.promises.rm).not.toHaveBeenCalled()
        })

        it('Two files', async () => {
            fsMock.promises.readdir.mockReturnValueOnce(['first_file', 'second_file'])

            expect(await getInstalledVersion('/some/path')).toBeUndefined()
            expect(fsMock.promises.rm).toHaveBeenCalled()
        })
    })

    describe('pullLatestVersion', () => {
        beforeEach(() => {
            fsMock.promises = {
                mkdir: jest.fn(),
            }
        })

        afterEach(() => {
            fsMock.promises = undefined
        })

        it('Valid response', async () => {
            axiosMock.mockReturnValueOnce({
                data: {
                    pipe: jest.fn((data: unknown) => ({
                        on: jest.fn(() => data),
                    })),
                },
            })

            await pullLatestVersion('/some/path', 'v1.0', '/some/url')

            expect(zipMock.writeZipFile).toHaveBeenCalledWith(path.normalize('/some/path/v1.0/v1.0.zip'), expect.anything())
            expect(zipMock.getUnzippedPath).toHaveBeenCalledWith(path.normalize('/some/path/v1.0'))
        })

        it('Invalid response', () => {
            axiosMock.mockReturnValueOnce({ data: {} })
            expect(async () => pullLatestVersion('/some/path', 'v1.0', '/some/url')).rejects.toThrow()
        })
    })
})
