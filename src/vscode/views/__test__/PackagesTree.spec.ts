import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { PackagesTreeProvider } from '../PackagesTree'
import { isLeafNode, isPackageNode, LeafNode, PackageNode } from '../BasePackagesTree'
import { TracedFunctionTreeProvider } from '../TracedFunctionsTree'

describe('PackagesTree tests', () => {
    const fakeState = { config: { packageTree: { separator: null } } }

    it('isPackageNode', () => {
        expect(isPackageNode(5)).toBe(false)
        expect(
            isPackageNode(
                new PackageNode('Some ctx', 'Some key', { kids: {}, label: '', packageName: '' }, TreeItemCollapsibleState.None)
            )
        ).toBe(true)
    })

    it('isLeafNode', () => {
        expect(isLeafNode(5)).toBe(false)
        expect(isLeafNode(new LeafNode('context', 'key', 'pkg'))).toBe(true)
    })

    it('update', () => {
        const provider = new PackagesTreeProvider([], fakeState)

        provider.update([{ name: 'foo', exports: [], nicknames: [] }])

        expect(Array.isArray(provider.getChildren())).toBe(true)
    })

    it('getTreeItem', () => {
        const provider = new PackagesTreeProvider([], fakeState)
        const item = {}

        expect(provider.getTreeItem(item)).toBe(item)
    })

    describe('getChildren', () => {
        it('No package', () => {
            const provider = new PackagesTreeProvider([], fakeState)

            expect(provider.getChildren(new TreeItem('foo'))).toStrictEqual([])
        })

        it('Have package', () => {
            const provider = new PackagesTreeProvider([{ name: 'foo', exports: [], nicknames: [] }], fakeState)

            expect(provider.getChildren(new TreeItem('foo'))).toStrictEqual([])
        })

        it('Have package with exports', () => {
            const provider = new PackagesTreeProvider([{ name: 'foo', exports: ['bar'], nicknames: [] }], fakeState)
            const kids = provider.getChildren(new TreeItem('foo'))

            expect(Array.isArray(kids)).toBe(true)
        })

        it('Default', () => {
            const provider = new PackagesTreeProvider([{ name: 'foo', exports: [], nicknames: [] }], fakeState)
            const item = new TreeItem('foo')

            item.label = undefined

            expect(provider.getChildren(item)).toStrictEqual([])
        })

        it('No element', () => {
            const provider = new PackagesTreeProvider(
                [
                    { name: 'foo', exports: [], nicknames: [] },
                    { name: 'bar', exports: ['baz'], nicknames: [] },
                    { name: 'g', exports: ['a'], nicknames: [] },
                ],
                fakeState
            )

            const kids = provider.getChildren()

            expect(Array.isArray(kids)).toBe(true)

            if (Array.isArray(kids)) {
                expect(kids[0].label).toBe('bar')
                expect(kids[1].label).toBe('foo')
                expect(kids[2].label).toBe('g')
            }
        })

        describe('Nested packages', () => {
            it('String separator', async () => {
                const provider = new PackagesTreeProvider(
                    [
                        { name: 'a/b/c', exports: [], nicknames: [] },
                        { name: 'foo/bar', exports: ['baz'], nicknames: [] },
                        { name: 'foo/d', exports: ['e'], nicknames: [] },
                    ],
                    { ...fakeState, config: { packageTree: { separator: '/' } } }
                )

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

            it('Array of separators', async () => {
                const provider = new PackagesTreeProvider(
                    [
                        { name: 'a/b/c', exports: [], nicknames: [] },
                        { name: 'foo-bar', exports: ['baz'], nicknames: [] },
                        { name: 'foo*d', exports: ['e'], nicknames: [] },
                    ],
                    { ...fakeState, config: { packageTree: { separator: ['/', '-', '*'] } } }
                )

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

    describe('TraceFunctionsTree', () => {
        it('getItem methods', () => {
            const tree = new TracedFunctionTreeProvider([], fakeState)

            expect(tree.getItemName({ name: 'foo', traced: [] })).toBe('foo')
            expect(tree.getItemChildren({ name: 'foo', traced: ['bar', 'bas'] })).toStrictEqual(['bar', 'bas'])
        })

        it('listPackages', () => {
            const tree = new TracedFunctionTreeProvider(
                [
                    { name: 'foo', traced: [] },
                    { name: 'bar', traced: [] },
                ],
                fakeState
            )

            const pkgs = tree.listPackages()

            expect(pkgs[0]).toBe('foo')
            expect(pkgs[1]).toBe('bar')
        })
    })
})
