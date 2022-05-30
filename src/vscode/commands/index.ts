import { ExtensionState } from '../Types'

export * from './Repl'

export function clearInlineResults(state: ExtensionState) {
    state.hoverText = ''
}
