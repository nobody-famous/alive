module.exports.plistToObj = (plist) => {
    if (plist === undefined) {
        return undefined;
    }

    const obj = {};

    for (let ndx = 0; ndx < plist.length; ndx += 2) {
        const name = convert(plist[ndx]);
        const value = convert(plist[ndx + 1]);

        obj[name.toLowerCase()] = value;
    }

    return obj;
};

module.exports.convertArray = (arr) => {
    return (arr !== undefined)
        ? arr.map(item => convert(item))
        : undefined;
    // for (let ndx = 0; ndx < arr.length; ndx += 1) {
    //     arr[ndx] = convert(arr[ndx]);
    // }
};

function convert(symbol) {
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
