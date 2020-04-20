const { plistToObj, convertArray } = require('./SwankUtils');

module.exports.ConnectionInfo = class {
    constructor(data) {
        const obj = plistToObj(data);

        this.pid = (obj.pid !== undefined) ? parseInt(obj.pid) : undefined;

        if (obj.encoding !== undefined) {
            this.encoding = plistToObj(obj.encoding);
            this.encoding.coding_systems = convertArray(this.encoding.coding_systems);
        }

        this.impl = plistToObj(obj.lisp_implementation);
        this.machine = plistToObj(obj.machine);
        this.package = plistToObj(obj.package);

        this.style = obj.style;
        this.features = convertArray(obj.features);
        this.modules = convertArray(obj.modules);
        this.version = obj.version;
    }
};
