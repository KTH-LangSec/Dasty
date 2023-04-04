const cp = require('child_process');

const obj = {};

const fn = obj.fn;

if (typeof fn !== 'number') {
    throw new TypeError("Invalid type")
}

console.log(typeof fn);

try {
    cp.exec(fn);
} catch (e) {

}

