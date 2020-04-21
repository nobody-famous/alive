const { LispID, LispQuote, LispSymbol } = require('./LispID');

module.exports.plistToObj = (plist) => {
    if (plist === undefined) {
        return undefined;
    }

    const obj = {};

    for (let ndx = 0; ndx < plist.length; ndx += 2) {
        const name = exports.convert(plist[ndx]);
        const value = exports.convert(plist[ndx + 1]);

        obj[name.toLowerCase()] = value;
    }

    return obj;
};

module.exports.convert = (symbol) => {
    if (typeof symbol !== 'string') {
        return symbol;
    }

    if (symbol.charAt(0) === ':') {
        return symbol.substring(1).replace(/-/, '_');
    }

    if (symbol.charAt(0) === '\"' && symbol.charAt(symbol.length - 1) === '\"') {
        return symbol.substring(1, symbol.length - 1);
    }

    return symbol;
}

module.exports.convertArray = (arr) => {
    if (!Array.isArray(arr)) {
        return arr;
    }

    return arr.map(item => exports.convert(item));
};

module.exports.toWire = (item) => {
    let str = '';

    if (Array.isArray(item)) {
        str += arrayToWire(item);
    } else if (item instanceof LispSymbol) {
        str += `:${item.id}`;
    } else if (item instanceof LispID) {
        str += `${item.id}`;
    } else if (item instanceof LispQuote) {
        str += `'${item.form}`;
    } else if (typeof item === 'object') {
        str += objectToWire(item);
    } else if (typeof item === 'string') {
        str += `"${item.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    } else if (item === true) {
        str += `t`;
    } else {
        str += item;
    }

    return str;
}

function objectToWire(obj) {
    let str = '(';
    const keys = Object.keys(obj);

    for (let ndx = 0; ndx < keys.length - 1; ndx += 1) {
        const key = keys[ndx];

        str += `:${key} ${exports.toWire(obj[key])} `;
    }

    const key = keys[keys.length - 1];
    str += `:${key} ${exports.toWire(obj[key])}`;

    return str + ')';
}

function arrayToWire(arr) {
    let str = '(';

    for (let ndx = 0; ndx < arr.length - 1; ndx += 1) {
        str += exports.toWire(arr[ndx]) + ' ';
    }

    str += exports.toWire(arr[arr.length - 1]) + ')';

    return str;
}
