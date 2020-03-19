const arrays = require('./arrays');
const characters = require('./characters');
const conditions = require('./conditions');
const conses = require('./conses');
const control = require('./control');
const env = require('./env');
const eval = require('./eval');
const filenames = require('./filenames');
const files = require('./files');
const hashtables = require('./hashtables');
const iteration = require('./iteration');
const numbers = require('./numbers');
const objects = require('./objects');
const packages = require('./packages');
const printer = require('./printer');
const reader = require('./reader');
const sequences = require('./sequences');
const streams = require('./streams');
const strings = require('./strings');
const structures = require('./structures');
const sysconstruct = require('./sysconstruct');
const symbols = require('./symbols');
const types = require('./types');

module.exports.keywords = []
    .concat(arrays)
    .concat(characters)
    .concat(conditions)
    .concat(conses)
    .concat(control)
    .concat(env)
    .concat(eval)
    .concat(filenames)
    .concat(files)
    .concat(hashtables)
    .concat(iteration)
    .concat(numbers)
    .concat(objects)
    .concat(packages)
    .concat(printer)
    .concat(reader)
    .concat(sequences)
    .concat(streams)
    .concat(strings)
    .concat(structures)
    .concat(sysconstruct)
    .concat(symbols)
    .concat(types);

module.exports.allLabels = []
    .concat(getLabels(arrays))
    .concat(getLabels(characters))
    .concat(getLabels(conditions))
    .concat(getLabels(conses))
    .concat(getLabels(control))
    .concat(getLabels(env))
    .concat(getLabels(eval))
    .concat(getLabels(filenames))
    .concat(getLabels(files))
    .concat(getLabels(hashtables))
    .concat(getLabels(iteration))
    .concat(getLabels(numbers))
    .concat(getLabels(objects))
    .concat(getLabels(packages))
    .concat(getLabels(printer))
    .concat(getLabels(reader))
    .concat(getLabels(sequences))
    .concat(getLabels(streams))
    .concat(getLabels(strings))
    .concat(getLabels(structures))
    .concat(getLabels(sysconstruct))
    .concat(getLabels(symbols))
    .concat(getLabels(types));

function getLabels(entries) {
    const labels = [];

    entries.forEach(entry => labels.push(entry.label));

    return labels;
}
