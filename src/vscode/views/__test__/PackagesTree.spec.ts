import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { ExportNode, PackageNode, PackagesTreeProvider, isExportNode, isPackageNode } from '../PackagesTree'

describe('PackagesTree tests', () => {
    it('isPackageNode', () => {
        expect(isPackageNode(5)).toBe(false)
        expect(isPackageNode(new PackageNode('Some key', TreeItemCollapsibleState.None))).toBe(true)
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

            expect(provider.getChildren(new TreeItem('foo'))).toBeUndefined()
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
            ])

            const kids = provider.getChildren()

            expect(Array.isArray(kids)).toBe(true)

            if (Array.isArray(kids)) {
                expect(kids.length).toBe(2)
            }
        })
    })
})
