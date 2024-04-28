import { HistoryItem } from '../../Types'
import { HistoryNode, ReplHistoryTreeProvider, isHistoryNode } from '../ReplHistory'

describe('ReplHistory tests', () => {
    it('isHistoryNode', () => {
        expect(isHistoryNode(5)).toBe(false)
        expect(isHistoryNode(new HistoryNode({ pkgName: 'pkg', text: 'text' }))).toBe(true)
    })

    it('update', () => {
        const history = new ReplHistoryTreeProvider([])

        history.update([{ pkgName: 'foo', text: 'foo' }])

        const kids = history.getChildren()

        expect(Array.isArray(kids)).toBe(true)

        if (Array.isArray(kids)) {
            expect(kids[0].label).toBe('foo')
        }
    })

    it('getItems', () => {
        const items: HistoryItem[] = []
        const history = new ReplHistoryTreeProvider(items)

        expect(history.getItems()).toBe(items)
    })

    describe('getCurrentItem', () => {
        it('No items', () => {
            const history = new ReplHistoryTreeProvider([])

            expect(history.getCurrentItem()).toBeUndefined()
        })

        it('Increment index', () => {
            const history = new ReplHistoryTreeProvider([
                { pkgName: 'foo', text: 'foo' },
                { pkgName: 'bar', text: 'bar' },
            ])

            history.incrementIndex()

            expect(history.getCurrentItem()?.pkgName).toBe('foo')
        })

        it('Decrement index', () => {
            const history = new ReplHistoryTreeProvider([
                { pkgName: 'foo', text: 'foo' },
                { pkgName: 'bar', text: 'bar' },
            ])

            history.incrementIndex()
            history.incrementIndex()
            history.decrementIndex()

            expect(history.getCurrentItem()?.pkgName).toBe('foo')
        })

        it('Increment index + add', () => {
            const history = new ReplHistoryTreeProvider([
                { pkgName: 'foo', text: 'foo' },
                { pkgName: 'bar', text: 'bar' },
            ])

            history.incrementIndex()
            history.addItem('baz', 'baz')

            expect(history.getCurrentItem()).toBeUndefined()
        })

        it('Increment index + remove', () => {
            const history = new ReplHistoryTreeProvider([
                { pkgName: 'foo', text: 'foo' },
                { pkgName: 'bar', text: 'bar' },
            ])

            history.incrementIndex()
            history.removeItem('bar', 'bar')

            expect(history.getCurrentItem()).toBeUndefined()
        })
    })

    it('clear', () => {
        const history = new ReplHistoryTreeProvider([{ pkgName: 'foo', text: 'foo' }])

        history.clear()

        expect(history.getChildren()).toStrictEqual([])
    })

    it('getChildren', () => {
        const history = new ReplHistoryTreeProvider([])
        const kids = history.getChildren(new HistoryNode({ pkgName: 'pkg', text: 'text' }))

        expect(Array.isArray(kids)).toBe(true)

        if (Array.isArray(kids)) {
            expect(kids[0].label).toBe('pkg')
        }
    })
})
