const { format } = require('util');

module.exports.State = class {
    constructor(tokens) {
        this.tokens = tokens;

        this.ndx = 0;
        this.topLevelBlankLines = undefined;
        this.indent = undefined;
    }

    setOptions(opts) {
        this.indent = (opts.tabSize !== undefined) ? opts.tabSize : 2;
        this.topLevelBlankLines = (opts.topLevelBlankLines !== undefined) ? opts.topLevelBlankLines : 1;
    }
};
