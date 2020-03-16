const arrays = require('./completion/arrays');
const characters = require('./completion/characters');
const conditions = require('./completion/conditions');
const conses = require('./completion/conses');
const control = require('./completion/control');
const env = require('./completion/env');
const eval = require('./completion/eval');
const filenames = require('./completion/filenames');
const files = require('./completion/files');
const hashtables = require('./completion/hashtables');
const iteration = require('./completion/iteration');
const numbers = require('./completion/numbers');
const objects = require('./completion/objects');
const packages = require('./completion/packages');
const printer = require('./completion/printer');
const reader = require('./completion/reader');
const sequences = require('./completion/sequences');
const streams = require('./completion/streams');
const strings = require('./completion/strings');
const structures = require('./completion/structures');
const sysconstruct = require('./completion/sysconstruct');
const symbols = require('./completion/symbols');
const types = require('./completion/types');
const { CompletionItem, CompletionItemKind, MarkdownString } = require('vscode');

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
    constructor() { }

    provideCompletionItems(document, pos, token, ctx) {
        return completions;
    }
};
