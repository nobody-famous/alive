import { ExtensionState } from '../Types'

export * from './Repl'

export function clearInlineResults(state: Pick<ExtensionState, 'hoverText'>) {
    state.hoverText = ''
}
