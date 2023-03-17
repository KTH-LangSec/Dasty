const cp = require('child_process');
const assert = require('assert');

function error(someInput) {
    // if (someInput < 100) {
    throw new Error('this should not happen');
    // }

    console.log('yes');
}

function someFun(a, b) {
}

const obj = {};
someFun(error(obj.cmd), 'hallo', 'flub');
// assert.throws(error(10), /unknown value/);
// error(obj.input);

// cp.exec(obj.cmd);
