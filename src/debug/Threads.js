module.exports.Threads = class {
    constructor(data) {
        this.headers = data[0];
        this.info = [];

        for (let ndx = 1; ndx < data.length; ndx += 1) {
            const [id, name, status] = data[ndx];

            this.info.push({
                id: parseInt(id),
                name,
                status,
            });
        }
    }
};
