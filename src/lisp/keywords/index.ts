import arrays from './arrays'
import characters from './characters'
import conditions from './conditions'
import conses from './conses'
import control from './control'
import env from './env'
import eval from './eval'
import filenames from './filenames'
import files from './files'
import hashtables from './hashtables'
import iteration from './iteration'
import numbers from './numbers'
import objects from './objects'
import packages from './packages'
import printer from './printer'
import reader from './reader'
import sequences from './sequences'
import streams from './streams'
import strings from './strings'
import structures from './structures'
import sysconstruct from './sysconstruct'
import symbols from './symbols'
import types from './types'

export type kwEntry = { label: string; type: string }

export const allLabels: string[] = [
    ...getLabels(arrays),
    ...getLabels(characters),
    ...getLabels(conditions),
    ...getLabels(conses),
    ...getLabels(control),
    ...getLabels(env),
    ...getLabels(eval),
    ...getLabels(filenames),
    ...getLabels(files),
    ...getLabels(hashtables),
    ...getLabels(iteration),
    ...getLabels(numbers),
    ...getLabels(objects),
    ...getLabels(packages),
    ...getLabels(printer),
    ...getLabels(reader),
    ...getLabels(sequences),
    ...getLabels(streams),
    ...getLabels(strings),
    ...getLabels(structures),
    ...getLabels(sysconstruct),
    ...getLabels(symbols),
    ...getLabels(types),
]

function getLabels(entries: kwEntry[]): string[] {
    const labels: string[] = []

    entries.forEach((entry) => labels.push(entry.label))

    return labels
}
