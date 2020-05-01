module.exports.RestartsTreeProvider = class {
    constructor() { }

    getChildren(element) {
        console.log('getChildren', element);
    }

    getTreeItem(element) {
        console.log('getTreeItem', element);
    }
};
