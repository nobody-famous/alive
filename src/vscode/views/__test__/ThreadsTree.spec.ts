import { ThreadsTreeProvider, isThreadNode } from '../ThreadsTree'

describe('ThreadsTree tests', () => {
    it('update', () => {
        const provider = new ThreadsTreeProvider([])

        provider.update([{ id: 'foo', name: 'foo' }])

        const kids = provider.getChildren()
        expect(Array.isArray(kids)).toBe(true)
        if (!Array.isArray(kids) || !isThreadNode(kids[0])) {
            return
        }

        expect(isThreadNode(kids[0])).toBe(true)
        expect(kids[0].label).toBe('foo')
    })

    it('getTreeItem', () => {
        const provider = new ThreadsTreeProvider([])
        const item = {}

        expect(provider.getTreeItem(item)).toBe(item)
    })
})
