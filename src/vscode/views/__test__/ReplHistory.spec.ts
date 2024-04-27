import { HistoryNode, ReplHistoryTreeProvider, isHistoryNode } from '../ReplHistory'

describe('ReplHistory tests', () => {
    it('isHistoryNode', () => {
        expect(isHistoryNode(5)).toBe(false)
        expect(isHistoryNode(new HistoryNode({ pkgName: 'pkg', text: 'text' }))).toBe(true)
    })

    it('update', () => {
        const history = new ReplHistoryTreeProvider([])

        history.update([{ pkgName: 'foo', text: 'foo' }])
    })
})
