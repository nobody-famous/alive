module.exports.Threads = class {
    constructor(data) {
        this.headers = data[0];
        this.threads = [];

        for (let ndx = 1; ndx < data.length; ndx += 1) {
            const [id, name, status] = data[ndx];

            this.threads.push({
                id: parseInt(id),
                name,
                status,
            });
        }

        this.threads.sort((a, b) => a.id > b.id ? 1 : -1);
    }
};
