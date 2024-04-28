import { AsdfSystemsTreeProvider } from '../AsdfSystemsTree'

describe('AsdfSystemsTree tests', () => {
    it('update', () => {
        const tree = new AsdfSystemsTreeProvider([])
        let eventFired = false

        tree.onDidChangeTreeData(() => {
            eventFired = true
        })
        tree.update(['foo', 'bar'])

        expect(eventFired).toBe(true)
    })

    it('getTreeItem', () => {
        const tree = new AsdfSystemsTreeProvider([])
        const result = tree.getTreeItem({ label: 'test item' })

        expect(result).toMatchObject({ label: 'test item' })
    })

    it('getChildren', () => {
        const tree = new AsdfSystemsTreeProvider(['foo', 'bar'])

        expect(tree.getChildren()).toMatchObject([{}, {}])
        expect(tree.getChildren({ label: 'test item' })).toMatchObject([])
    })
})
