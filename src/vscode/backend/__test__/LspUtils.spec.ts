import * as path from 'path'
import { createPath, doesPathExist, getInstalledVersion, getLatestVersion, pullLatestVersion } from '../LspUtils'

const axiosMock = jest.requireMock('axios')
jest.mock('axios')

const fsMock = jest.requireMock('fs')
jest.mock('fs')

const zipMock = jest.requireMock('../ZipUtils')
jest.mock('../ZipUtils')

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
