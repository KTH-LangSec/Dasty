// const util = require('node:util');
// const exec = util.promisify(require('child_process').exec);
// const cp = require('child_process');
//
// const mockModule = require('./module-wrapper/mock-module');
// const {spawn} = require("child_process");
//
// const obj = {};
//
// const x = [obj.blub + 'hi'];
//
// const y = 'ho'
//
// // eval(x);
//
// cp.exec(x);
//
// // eval(`console.log('heyho${x}');`);

// let i = 0;
let result = true;
const obj = {t: true};
// if (result) {
//     i = 0;
// }

// const x = !!result;
// if (result) {
//     console.log('hey');
// }

async function cond(c) {
    return c;
}

cond(true).then();

if (result) {
    // console.log('hey');
}

let i = 0;
while (result) {
    if (i++ >= 0) {
        result = false;
        obj.t = undefined;
    }
}

