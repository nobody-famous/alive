const arrays = require('./keywords/arrays');
const characters = require('./keywords/characters');
const conditions = require('./keywords/conditions');
const conses = require('./keywords/conses');
const control = require('./keywords/control');
const env = require('./keywords/env');
const eval = require('./keywords/eval');
const filenames = require('./keywords/filenames');
const files = require('./keywords/files');
const hashtables = require('./keywords/hashtables');
const iteration = require('./keywords/iteration');
const numbers = require('./keywords/numbers');
const objects = require('./keywords/objects');
const packages = require('./keywords/packages');
const printer = require('./keywords/printer');
const reader = require('./keywords/reader');
const sequences = require('./keywords/sequences');
const streams = require('./keywords/streams');
const strings = require('./keywords/strings');
const structures = require('./keywords/structures');
const sysconstruct = require('./keywords/sysconstruct');
const symbols = require('./keywords/symbols');
const types = require('./keywords/types');
const { CompletionItem, MarkdownString } = require('vscode');

const sysWords = arrays
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

const completions = sysWords.map(word => {
    const item = new CompletionItem(word.label);

    if (word.doc !== undefined) {
        item.documentation = new MarkdownString(word.doc);
    }

    return item;
});

module.exports.CompletionProvider = class {
    constructor() {
    }

    getCompletions(document, pos, token, ctx) {
        return completions;
    }
};
