import { InspectInfo } from '../../Types'
import { Inspector } from '../Inspector'
import { createPanel } from './utils'

const vscodeMock = jest.requireMock('vscode')
jest.mock('vscode')

describe('Inspector tests', () => {
    it('Show', () => {
        const result: InspectInfo = {
            id: 5,
            resultType: 'foo',
            result: {},
            text: 'Some text',
            package: 'Some package',
        }
        const panel = createPanel()
        const inspector = new Inspector('/some/path', vscodeMock.ViewColumn.Two, result)

        vscodeMock.window.createWebviewPanel.mockReturnValueOnce(panel)
        inspector.show()

        expect(vscodeMock.commands.executeCommand).toHaveBeenCalled()
    })
})
