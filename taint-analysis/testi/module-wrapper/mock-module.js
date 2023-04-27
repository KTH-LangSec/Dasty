const cp = require('child_process');

async function funModule() {
    undefinedPropRead();
}

class ClassModule {
    somethingElse() {

    }

    undefinedPropRead() {
        this.somethingElse();
        const obj = {};
        return obj.blub;
    }

}


function undefinedPropRead() {
    const obj = {};
    cp.exec('echo ' + obj.blub);
}

const objModule = {
    objectFun: () => ({
        prop: 'prop',
        undefinedPropRead
    }),

    primFun: () => {
        return 'stringFunResult';
    },

    prim: 'stringProp',

    subObj: {}
}

module.exports = funModule;