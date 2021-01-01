import { ExtensionState } from '../Types'

export * from './Inspector'
export * from './Repl'
export * from './SelectSexpr'
export * from './Skeleton'

export function clearInlineResults(state: ExtensionState) {
    state.hoverText = ''
}
