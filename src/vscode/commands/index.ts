import { ExtensionState } from '../Types'

export * from './Repl'
export * from './SelectSexpr'

export function clearInlineResults(state: ExtensionState) {
    state.hoverText = ''
}
