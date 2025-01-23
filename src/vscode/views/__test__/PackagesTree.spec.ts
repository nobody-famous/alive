import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { ExportNode, PackageNode, PackagesTreeProvider, isExportNode, isPackageNode } from '../PackagesTree'

describe('PackagesTree tests', () => {
    it('isPackageNode', () => {
        expect(isPackageNode(5)).toBe(false)
        expect(
            isPackageNode(new PackageNode('Some key', { kids: {}, label: '', packageName: '' }, TreeItemCollapsibleState.None))
        ).toBe(true)
    })

    it('isExportNode', () => {
        expect(isExportNode(5)).toBe(false)
        expect(isExportNode(new ExportNode('key', 'pkg'))).toBe(true)
    })

    it('update', () => {
        const provider = new PackagesTreeProvider([])

        provider.update([{ name: 'foo', exports: [], nicknames: [] }])

        expect(Array.isArray(provider.getChildren())).toBe(true)
    })

    it('getTreeItem', () => {
        const provider = new PackagesTreeProvider([])
        const item = {}

        expect(provider.getTreeItem(item)).toBe(item)
    })

    describe('getChildren', () => {
        it('No package', () => {
            const provider = new PackagesTreeProvider([])

            expect(provider.getChildren(new TreeItem('foo'))).toStrictEqual([])
        })

        it('Have package', () => {
            const provider = new PackagesTreeProvider([{ name: 'foo', exports: [], nicknames: [] }])

            expect(provider.getChildren(new TreeItem('foo'))).toStrictEqual([])
        })

        it('Have package with exports', () => {
            const provider = new PackagesTreeProvider([{ name: 'foo', exports: ['bar'], nicknames: [] }])
            const kids = provider.getChildren(new TreeItem('foo'))

            expect(Array.isArray(kids)).toBe(true)
        })

        it('Default', () => {
            const provider = new PackagesTreeProvider([{ name: 'foo', exports: [], nicknames: [] }])
            const item = new TreeItem('foo')

            item.label = undefined

            expect(provider.getChildren(item)).toStrictEqual([])
        })

        it('No element', () => {
            const provider = new PackagesTreeProvider([
                { name: 'foo', exports: [], nicknames: [] },
                { name: 'bar', exports: ['baz'], nicknames: [] },
                { name: 'g', exports: ['a'], nicknames: [] },
            ])

            const kids = provider.getChildren()

            expect(Array.isArray(kids)).toBe(true)

            if (Array.isArray(kids)) {
                expect(kids[0].label).toBe('bar')
                expect(kids[1].label).toBe('foo')
                expect(kids[2].label).toBe('g')
            }
        })

        it('Nested packages', async () => {
            const provider = new PackagesTreeProvider([
                { name: 'a/b/c', exports: [], nicknames: [] },
                { name: 'foo/bar', exports: ['baz'], nicknames: [] },
                { name: 'foo/d', exports: ['e'], nicknames: [] },
            ])

            const kids = await provider.getChildren()

            expect(Array.isArray(kids)).toBe(true)

            if (Array.isArray(kids)) {
                expect(kids[0].label).toBe('a')
                expect(kids[1].label).toBe('foo')
            }

            if (isPackageNode(kids?.[1])) {
                const aKids = await provider.getChildren(kids[0])
                expect(aKids).not.toBeNull()

                const bKids = await provider.getChildren(aKids?.[0])
                expect(bKids).not.toBeNull()
                expect(bKids?.[0].label).toBe('c')

                const fooKids = await provider.getChildren(kids[1])
                expect(fooKids).not.toBeNull()

                const barKids = await provider.getChildren(fooKids?.[0])
                expect(barKids).not.toBeNull()
                expect(barKids?.[0]?.label).toBe('baz')
            }
        })
    })
})
